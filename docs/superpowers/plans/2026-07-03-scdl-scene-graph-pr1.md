# SCDL v1.2 Scene-Graph PR-1 (Graph Core) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Instanced grammar (`def`/`group`/`instance`), hierarchical scene-graph compilation into compact `PB-SCENE-GRAPH-v1` packets, and a geometry-only forward renderer that exporters use to rasterize graph assets deterministically.

**Architecture:** Layered extension per the approved spec (`docs/superpowers/specs/2026-07-03-scdl-scene-graph-design.md`). The existing 8-pass pipeline is untouched and remains the path for flat assets; assets using any graph construct branch after `resolveMaterials` into a new `buildSceneGraphPass`, emit a scene-graph packet whose ID hashes the canonical program (never pixels), and are rasterized on demand by `scene-graph-renderer.js` (inverse-mapped affine sampling, painter order).

**Tech Stack:** Node ESM, vitest, existing PixelBrain modules (`shared.js` hashString, `symmetry-amp.js`, `material-registry.js`, `pixelbrain-asset-packet.js`).

## Global Constraints

- **Legacy invariance:** every existing fixture must keep its packet ID byte-identical: `slime-sphere → pbasset_1e332fe6`, `crimson-ooze-sphere → pbasset_06540f60`, `void_chestplate → pbasset_3b9fbe42`, `env_test → pbasset_0a47b8a8`, `void_acolyte frames → pbasset_2595caa6, pbasset_80c6dd3f, pbasset_d0d580c4, pbasset_b85c4328`. Task 1 installs the net; it must pass after every task.
- **Determinism:** no `Math.random`, no `Date`, no float accumulation in compositing. Same source → same packet ID → same framebuffer bytes.
- **Transform law:** per-node order scale → mirror → rotate → translate; `M_world = M_parent · M_local`; inverse-mapped sampling at pixel centers `(x+0.5, y+0.5)` with `floor` cell lookup.
- **Depth cap:** 8. **Error codes:** SCDL-016..021 = `0x1010..0x1015`, ARTIFACT range.
- **Identity law:** graph packet ID = `pbasset_` + `hashString(stableJson(sceneGraph))` hex, 8 chars. `sceneGraph` must contain no source locations, comments, or semantic annotations.
- **`compileSCDL` never throws.** All new passes push into `errors` and return.
- **Frames + graph mode is PR-3:** compiling a graph asset with `frame` blocks must ERROR clearly, not misbehave.
- Test files live in `tests/codex/core/pixelbrain/scdl/`; imports use `../../../../../codex/...` relative paths; run with `npx vitest run <file>`.

---

### Task 1: Legacy invariance suite (the regression net)

**Files:**
- Test: `tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`

**Interfaces:**
- Consumes: `compileSCDL(source)` from `codex/core/pixelbrain/scdl/scdl.compiler.js` (existing).
- Produces: nothing — a permanent invariant every later task must keep green.

- [ ] **Step 1: Write the test (it must PASS immediately — it encodes current behavior)**

```js
/**
 * SCDL Legacy Invariance — packet IDs of every shipped fixture are frozen.
 * If this file goes red, a change broke the Determinism Law for flat assets.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/scdl/fixtures'
);

const FROZEN_IDS = {
  'slime-sphere.scdl':                 ['pbasset_1e332fe6'],
  'crimson-ooze-sphere.scdl':          ['pbasset_06540f60'],
  'void_chestplate.scdl':              ['pbasset_3b9fbe42'],
  'env_test/env_test.scdl':            ['pbasset_0a47b8a8'],
  'void_acolyte/void_acolyte.scdl':    [
    'pbasset_2595caa6', 'pbasset_80c6dd3f', 'pbasset_d0d580c4', 'pbasset_b85c4328',
  ],
};

describe('legacy invariance — frozen packet IDs', () => {
  for (const [file, ids] of Object.entries(FROZEN_IDS)) {
    it(`${file} compiles to ${ids.join(', ')}`, () => {
      const source = readFileSync(join(FIXTURES, file), 'utf8');
      const result = compileSCDL(source);
      expect(result.ok).toBe(true);
      expect(result.framePackets.map(p => p.id)).toEqual(ids);
    });
  }
});
```

- [ ] **Step 2: Run it — must pass against unmodified code**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
Expected: PASS (5 tests). If any ID differs, STOP — re-capture actual IDs with a `console.log` and fix the table before proceeding; the net must reflect reality.

- [ ] **Step 3: Commit**

```bash
git add tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js
git commit -m "test(scdl): freeze legacy fixture packet IDs as invariance net"
```

---

### Task 2: Error codes SCDL-016..021

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.errors.js:22-56`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-errors.test.js`

**Interfaces:**
- Produces: `SCDL_ERROR_CODES.UNKNOWN_DEF_REF (0x1010)`, `.DEF_CYCLE (0x1011)`, `.DEPTH_CAP (0x1012)`, `.INVALID_TRANSFORM (0x1013)`, `.DEAD_INSTANCE (0x1014)`, `.DEAD_DEF (0x1015)` with labels `SCDL-016`..`SCDL-021`. Later tasks reference these exact names.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { SCDL_ERROR_CODES, scdlError, scdlWarn } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

describe('SCDL-016..021 graph error codes', () => {
  it('defines the six graph codes in the 0x1010 range', () => {
    expect(SCDL_ERROR_CODES.UNKNOWN_DEF_REF).toBe(0x1010);
    expect(SCDL_ERROR_CODES.DEF_CYCLE).toBe(0x1011);
    expect(SCDL_ERROR_CODES.DEPTH_CAP).toBe(0x1012);
    expect(SCDL_ERROR_CODES.INVALID_TRANSFORM).toBe(0x1013);
    expect(SCDL_ERROR_CODES.DEAD_INSTANCE).toBe(0x1014);
    expect(SCDL_ERROR_CODES.DEAD_DEF).toBe(0x1015);
  });
  it('labels them SCDL-016..SCDL-021 and encodes bytecode', () => {
    const e = scdlError('x', SCDL_ERROR_CODES.UNKNOWN_DEF_REF, { line: 1, col: 1 });
    expect(e.label).toBe('SCDL-016');
    expect(e.bytecodeString).toMatch(/^PB-ERR-v1-/);
    const w = scdlWarn('x', SCDL_ERROR_CODES.DEAD_DEF, { line: 1, col: 1 });
    expect(w.label).toBe('SCDL-021');
    expect(w.isWarn()).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-errors.test.js`
Expected: FAIL — `UNKNOWN_DEF_REF` is `undefined`.

- [ ] **Step 3: Implement — extend both frozen maps in `scdl.errors.js`**

In `SCDL_ERROR_CODES` (after `DEAD_FRAME`):

```js
  // SCDL v1.2 — scene graph (PR-1)
  UNKNOWN_DEF_REF:       0x1010, // instance references undeclared def
  DEF_CYCLE:             0x1011, // def reference cycle
  DEPTH_CAP:             0x1012, // graph depth exceeds cap (8)
  INVALID_TRANSFORM:     0x1013, // non-finite transform params or scale 0
  DEAD_INSTANCE:         0x1014, // instance fully clipped off-canvas (warn)
  DEAD_DEF:              0x1015, // def declared but never instanced (warn)
```

In `SCDL_CODE_LABELS` (after `SCDL-015`):

```js
  [SCDL_ERROR_CODES.UNKNOWN_DEF_REF]:       'SCDL-016',
  [SCDL_ERROR_CODES.DEF_CYCLE]:             'SCDL-017',
  [SCDL_ERROR_CODES.DEPTH_CAP]:             'SCDL-018',
  [SCDL_ERROR_CODES.INVALID_TRANSFORM]:     'SCDL-019',
  [SCDL_ERROR_CODES.DEAD_INSTANCE]:         'SCDL-020',
  [SCDL_ERROR_CODES.DEAD_DEF]:              'SCDL-021',
```

- [ ] **Step 4: Run tests — new file passes, invariance stays green**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-errors.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js tests/codex/core/pixelbrain/scdl/scdl.errors.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/scdl.errors.js tests/codex/core/pixelbrain/scdl/scdl.graph-errors.test.js
git commit -m "feat(scdl): SCDL-016..021 scene-graph error codes (0x1010-0x1015)"
```

---

### Task 3: transform2d — affine matrix law

**Files:**
- Create: `codex/core/pixelbrain/scdl/render/transform2d.js`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.transform2d.test.js`

**Interfaces:**
- Produces (consumed by Tasks 9, 11):
  - `identity() → {a:1,b:0,c:0,d:1,e:0,f:0}` — matrix `[[a,c,e],[b,d,f]]` (SVG convention)
  - `matFromTransform({tx,ty,theta,sx,sy,mirror}) → M` — composes **T·R·Mir·S** (spec law: scale→mirror→rotate→translate). `theta` in degrees; multiples of 90 use an exact integer sin/cos table.
  - `matMul(m1, m2) → M` — apply `m2` first, then `m1`
  - `matInvert(m) → M | null` — null when `|det| < 1e-12`
  - `matApply(m, x, y) → [x', y']`
  - `isIntegerTranslation(m) → boolean` — a=d=1, b=c=0, e/f integers (lattice fast path predicate)
  - `transformAABB(m, {minX,minY,maxX,maxY}) → {minX,minY,maxX,maxY}` — world AABB of 4 transformed corners

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  identity, matFromTransform, matMul, matInvert, matApply,
  isIntegerTranslation, transformAABB,
} from '../../../../../codex/core/pixelbrain/scdl/render/transform2d.js';

describe('transform2d', () => {
  it('identity maps points to themselves', () => {
    expect(matApply(identity(), 3.5, -2)).toEqual([3.5, -2]);
  });

  it('composes scale → mirror → rotate → translate in that order', () => {
    // point (1,0): scale 2 → (2,0); mirror x (negate x) → (-2,0);
    // rotate 90° → (0,-2); translate (10,5) → (10,3)
    const m = matFromTransform({ tx: 10, ty: 5, theta: 90, sx: 2, sy: 2, mirror: 'x' });
    const [x, y] = matApply(m, 1, 0);
    expect(x).toBeCloseTo(10, 12);
    expect(y).toBeCloseTo(3, 12);
  });

  it('right-angle rotations are exact integers (no 6e-17 residue)', () => {
    for (const theta of [0, 90, 180, 270, 360, -90]) {
      const m = matFromTransform({ tx: 0, ty: 0, theta, sx: 1, sy: 1, mirror: null });
      for (const v of [m.a, m.b, m.c, m.d]) expect(Number.isInteger(v)).toBe(true);
    }
  });

  it('matInvert · mat is identity; degenerate returns null', () => {
    const m = matFromTransform({ tx: 7, ty: -3, theta: 33, sx: 1.4, sy: 0.7, mirror: 'y' });
    const inv = matInvert(m);
    const [x, y] = matApply(inv, ...matApply(m, 2.25, -1.5));
    expect(x).toBeCloseTo(2.25, 9);
    expect(y).toBeCloseTo(-1.5, 9);
    expect(matInvert({ a: 0, b: 0, c: 0, d: 0, e: 1, f: 1 })).toBeNull();
  });

  it('isIntegerTranslation detects the lattice fast path', () => {
    expect(isIntegerTranslation(matFromTransform({ tx: 4, ty: -2, theta: 0, sx: 1, sy: 1, mirror: null }))).toBe(true);
    expect(isIntegerTranslation(matFromTransform({ tx: 4.5, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null }))).toBe(false);
    expect(isIntegerTranslation(matFromTransform({ tx: 4, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null }))).toBe(false);
  });

  it('transformAABB bounds a rotated box', () => {
    const m = matFromTransform({ tx: 0, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null });
    const box = transformAABB(m, { minX: 0, minY: 0, maxX: 4, maxY: 2 });
    expect(box).toEqual({ minX: -2, minY: 0, maxX: 0, maxY: 4 });
  });

  it('matMul applies right operand first', () => {
    const t = matFromTransform({ tx: 10, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null });
    const r = matFromTransform({ tx: 0, ty: 0, theta: 90, sx: 1, sy: 1, mirror: null });
    // t·r : rotate first then translate → (1,0) → (0,1) → (10,1)
    expect(matApply(matMul(t, r), 1, 0)).toEqual([10, 1]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.transform2d.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `codex/core/pixelbrain/scdl/render/transform2d.js`**

```js
/**
 * SCDL 2D affine transforms — the Transform Law (spec §4).
 *
 * Matrix {a,b,c,d,e,f} represents [[a, c, e], [b, d, f]] (SVG convention):
 *   x' = a·x + c·y + e
 *   y' = b·x + d·y + f
 *
 * matFromTransform composes T(tx,ty) · R(θ) · Mir · S(sx,sy) — the fixed
 * per-node application order scale → mirror → rotate → translate.
 * θ multiples of 90° use an exact integer table so lattice rotations
 * never carry 6.1e-17 float residue.
 */

export function identity() {
  return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
}

const EXACT_TRIG = new Map([
  [0,   { cos: 1,  sin: 0 }],
  [90,  { cos: 0,  sin: 1 }],
  [180, { cos: -1, sin: 0 }],
  [270, { cos: 0,  sin: -1 }],
]);

function trig(thetaDegrees) {
  const norm = ((thetaDegrees % 360) + 360) % 360;
  const exact = EXACT_TRIG.get(norm);
  if (exact) return exact;
  const rad = (norm * Math.PI) / 180;
  return { cos: Math.cos(rad), sin: Math.sin(rad) };
}

export function matMul(m1, m2) {
  // Apply m2 first, then m1.
  return {
    a: m1.a * m2.a + m1.c * m2.b,
    b: m1.b * m2.a + m1.d * m2.b,
    c: m1.a * m2.c + m1.c * m2.d,
    d: m1.b * m2.c + m1.d * m2.d,
    e: m1.a * m2.e + m1.c * m2.f + m1.e,
    f: m1.b * m2.e + m1.d * m2.f + m1.f,
  };
}

export function matFromTransform(t = {}) {
  const tx = Number(t.tx) || 0;
  const ty = Number(t.ty) || 0;
  const sx = t.sx === undefined ? 1 : Number(t.sx);
  const sy = t.sy === undefined ? sx : Number(t.sy);
  const { cos, sin } = trig(Number(t.theta) || 0);
  const mirror = t.mirror || null;
  const mx = (mirror === 'x' || mirror === 'xy') ? -1 : 1;
  const my = (mirror === 'y' || mirror === 'xy') ? -1 : 1;

  const S   = { a: sx, b: 0, c: 0, d: sy, e: 0, f: 0 };
  const Mir = { a: mx, b: 0, c: 0, d: my, e: 0, f: 0 };
  const R   = { a: cos, b: sin, c: -sin, d: cos, e: 0, f: 0 };
  const T   = { a: 1, b: 0, c: 0, d: 1, e: tx, f: ty };
  return matMul(T, matMul(R, matMul(Mir, S)));
}

export function matInvert(m) {
  const det = m.a * m.d - m.b * m.c;
  if (Math.abs(det) < 1e-12) return null;
  const ia = m.d / det;
  const ib = -m.b / det;
  const ic = -m.c / det;
  const id = m.a / det;
  return {
    a: ia, b: ib, c: ic, d: id,
    e: -(ia * m.e + ic * m.f),
    f: -(ib * m.e + id * m.f),
  };
}

export function matApply(m, x, y) {
  return [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
}

export function isIntegerTranslation(m) {
  return m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1
    && Number.isInteger(m.e) && Number.isInteger(m.f);
}

export function transformAABB(m, box) {
  const corners = [
    matApply(m, box.minX, box.minY),
    matApply(m, box.maxX, box.minY),
    matApply(m, box.minX, box.maxY),
    matApply(m, box.maxX, box.maxY),
  ];
  return {
    minX: Math.min(...corners.map(c => c[0])),
    minY: Math.min(...corners.map(c => c[1])),
    maxX: Math.max(...corners.map(c => c[0])),
    maxY: Math.max(...corners.map(c => c[1])),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.transform2d.test.js`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/render/transform2d.js tests/codex/core/pixelbrain/scdl/scdl.transform2d.test.js
git commit -m "feat(scdl): transform2d affine law — T·R·Mir·S, exact 90° table, inverse, AABB"
```

---

### Task 4: raster-core extraction (unclipped rasterizers)

The renderer must rasterize def parts in local space where coordinates can be
negative and there is no canvas to clip against. Extract the rasterizers from
`expand-vector.pass.js` into `raster-core.js`, parameterized by an `accept(x,y)`
predicate instead of hard-coded canvas bounds. The pass keeps byte-identical
behavior (Task 1 net proves it).

**Files:**
- Create: `codex/core/pixelbrain/scdl/render/raster-core.js`
- Modify: `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js`

**Interfaces:**
- Produces (consumed by Task 11 and by the modified pass):
  - `pushCell(ops, x, y, color, loc, sourceOp)` — moved verbatim from the pass (same semantic-propagation behavior)
  - `rasterizeCircle(op, accept, ops)`, `rasterizeRing(op, accept, ops)`, `rasterizeRect(op, accept, ops)`, `rasterizePolygon(op, accept, ops)`, `rasterizePath(op, accept, ops)`, `rasterizeSphere(op, accept, ops)`, `rasterizeEllipse(op, accept, ops)`, `rasterizeLine(op, accept, ops)` — identical algorithms, `accept(x, y)` replaces `inBounds(x, y, W, H)`
  - `SPHERE_THRESHOLDS` re-exported
  - `acceptAll` — `() => true`
- **Critical detail:** `rasterizePolygon` currently scans `x` from `0..W-1`. Rework it to scan the polygon's own `floor(minX)..ceil(maxX)`; with `accept` = canvas bounds this emits the identical cell set in identical order, and with `acceptAll` it works for negative def-local coords.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  pushCell, acceptAll, rasterizeCircle, rasterizePolygon, rasterizeRect, rasterizeLine,
} from '../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';

describe('raster-core (unclipped rasterizers)', () => {
  it('rasterizes a circle across negative local coordinates', () => {
    const ops = [];
    rasterizeCircle({ cx: 0, cy: 0, radius: 1.5, color: '#ff0000', loc: {} }, acceptAll, ops);
    const keys = ops.map(o => `${o.x},${o.y}`);
    expect(keys).toContain('-1,0');
    expect(keys).toContain('0,-1');
    expect(keys).toContain('0,0');
  });

  it('polygon scanline covers its own AABB, not [0, W)', () => {
    const ops = [];
    rasterizePolygon(
      { points: [[-3, -1], [2, -1], [2, 2], [-3, 2]], color: '#00ff00', loc: {} },
      acceptAll, ops
    );
    const keys = new Set(ops.map(o => `${o.x},${o.y}`));
    expect(keys.has('-3,0')).toBe(true);
    expect(keys.has('1,1')).toBe(true);
  });

  it('accept predicate clips exactly like canvas bounds', () => {
    const clipped = [];
    const accept = (x, y) => x >= 0 && x < 4 && y >= 0 && y < 4;
    rasterizeRect({ x: -2, y: 1, w: 8, h: 1, color: '#0000ff', loc: {} }, accept, clipped);
    expect(clipped.map(o => o.x)).toEqual([0, 1, 2, 3]);
  });

  it('pushCell propagates partId/material/role from sourceOp', () => {
    const ops = [];
    rasterizeLine(
      { x0: 0, y0: 0, x1: 2, y1: 0, color: '#ffffff', loc: {}, partId: 'p1', material: 'gold', role: 'trim' },
      acceptAll, ops
    );
    expect(ops[0].partId).toBe('p1');
    expect(ops[0].material).toBe('gold');
    expect(ops[0].role).toBe('trim');
    expect(ops[0]._fromVector).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `raster-core.js` by moving code**

Move from `expand-vector.pass.js` into `codex/core/pixelbrain/scdl/render/raster-core.js`: `pushCell`, `samplePath`, `pointInPolygon`, `SPHERE_THRESHOLDS`, and all eight `rasterizeX` functions. Keep every algorithm line-for-line except:

1. Each function signature becomes `(op, accept, ops)`.
2. Every `inBounds(x, y, W, H)` call becomes `accept(x, y)`.
3. `rasterizeLine` keeps its `rasterLine` import from `../../raster-math.js` (path is now one level deeper: `raster-core.js` lives in `render/`, so the import is `../../raster-math.js` — same as before relative to `scdl/render/` → verify: `codex/core/pixelbrain/scdl/render/raster-core.js` → `codex/core/pixelbrain/raster-math.js` is `../../raster-math.js`. Correct.)
4. `rasterizePolygon` scan bounds change:

```js
export function rasterizePolygon(op, accept, ops) {
  const { points, color, loc } = op;
  if (!Array.isArray(points) || points.length < 3) return;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [px, py] of points) {
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
    for (let x = Math.floor(minX); x <= Math.ceil(maxX); x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points) && accept(x, y)) {
        pushCell(ops, x, y, color, loc, op);
      }
    }
  }
}
```

(`rasterizePath` keeps building its sampled polygon and calling `rasterizePolygon(polyOp, accept, ops)`.)

Also export:

```js
export const acceptAll = () => true;
export function makeCanvasAccept(w, h) {
  return (x, y) => x >= 0 && x < w && y >= 0 && y < h;
}
```

- [ ] **Step 4: Rewrite `expand-vector.pass.js` as a thin dispatcher**

Replace the moved code with imports; the pass keeps its public shape and the boolean/reference/transform handling:

```js
import {
  pushCell, acceptAll, makeCanvasAccept,
  rasterizeCircle, rasterizeRing, rasterizeRect, rasterizePolygon,
  rasterizePath, rasterizeSphere, rasterizeEllipse, rasterizeLine,
} from '../render/raster-core.js';
import { applyBooleanOp } from './lower-booleans.js';

export function expandVectorPass(ast, _errors) {
  const { canvas } = ast;
  const accept = makeCanvasAccept(canvas.width, canvas.height);

  const newParts = ast.parts.map(part => {
    const newOps = [];
    for (const op of part.ops) {
      const opWithContext = { ...op, partId: op.partId || part.id };
      switch (op.op) {
        case 'circle':   rasterizeCircle(opWithContext, accept, newOps);   break;
        case 'ring':     rasterizeRing(opWithContext, accept, newOps);     break;
        case 'rect':     rasterizeRect(opWithContext, accept, newOps);     break;
        case 'polygon':  rasterizePolygon(opWithContext, accept, newOps);  break;
        case 'path':     rasterizePath(opWithContext, accept, newOps);     break;
        case 'sphere':   rasterizeSphere(opWithContext, accept, newOps);   break;
        case 'ellipse':  rasterizeEllipse(opWithContext, accept, newOps);  break;
        case 'line':     rasterizeLine(opWithContext, accept, newOps);     break;
        case 'rotate': case 'scale': case 'translate': break; // reserved, emit nothing (unchanged)
        case 'union': case 'subtract': case 'intersect':
          applyBooleanOp(op.op, op.targets, part, canvas.width, canvas.height, newOps, _errors); break;
        case 'reference': case 'instance':
          if (opWithContext.ref) {
            pushCell(newOps, 0, 0, '#ffffff', opWithContext.loc || {}, { ...opWithContext, role: 'reference' });
          }
          break;
        default: newOps.push(op); break;
      }
    }
    return { ...part, ops: newOps, _vectorExpanded: true };
  });

  return { ...ast, parts: newParts };
}
```

Note the old `rasterizeTransform` no-op body is deleted; `rotate`/`scale`/`translate` verbs still parse and still emit nothing (identical observable behavior). Delete the now-unused `evaluateSDF`/`getRotationAtTime` imports.

- [ ] **Step 5: Run the full SCDL suite — invariance is the proof of the refactor**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: ALL PASS, including `scdl.legacy-invariance.test.js` and `scdl.vector-ops.test.js`.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/scdl/render/raster-core.js codex/core/pixelbrain/scdl/passes/expand-vector.pass.js tests/codex/core/pixelbrain/scdl/scdl.raster-core.test.js
git commit -m "refactor(scdl): extract raster-core with accept-predicate clipping; expand-vector delegates"
```

---

### Task 5: Grammar — `def` blocks

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.grammar.js` (program section ~line 650; add `parseDef` near `parsePart`; AST build ~line 671)
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js` (new)

**Interfaces:**
- Produces: `ast.defs = [{ id, nodes, loc }]` where `nodes` is an ordered array of scene nodes. In this task defs may contain only parts (`{ kind: 'part', part }`); Task 6 adds group/instance nodes and the recursive body parser. `ast.version` becomes `'1.2.0'`. `ast.graphMode` boolean appears (true when `defs.length > 0`; Task 6 extends the condition).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';

const DEF_SOURCE = `
asset forest canvas 32x32
palette { trunkc = #26180E }
def tree {
  part trunk material bark { rect -1 0 3 8 trunkc }
}
part ground material bark { rect 0 24 32 8 trunkc }
export json
`;

describe('SCDL v1.2 grammar — def blocks', () => {
  it('parses defs with local parts and negative coords', () => {
    const { ast, errors } = parseSCDL(DEF_SOURCE);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    expect(ast.version).toBe('1.2.0');
    expect(ast.defs).toHaveLength(1);
    expect(ast.defs[0].id).toBe('tree');
    expect(ast.defs[0].nodes[0].kind).toBe('part');
    expect(ast.defs[0].nodes[0].part.id).toBe('trunk');
    expect(ast.defs[0].nodes[0].part.ops[0].x).toBe(-1);
    expect(ast.graphMode).toBe(true);
  });

  it('legacy sources have empty defs and graphMode false', () => {
    const { ast } = parseSCDL('asset a canvas 4x4\npart p material gold { cell 1 1 #ffffff }\nexport json');
    expect(ast.defs).toEqual([]);
    expect(ast.graphMode).toBe(false);
    expect(ast.parts).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js`
Expected: FAIL — `ast.defs` undefined.

- [ ] **Step 3: Implement in `scdl.grammar.js`**

Add after `parsePart()`:

```js
  // ── def block (SCDL v1.2) ──
  // def_block ::= 'def' IDENT '{' (part_block | group_block | instance_stmt)* '}'
  function parseDef() {
    if (!atValue('def')) return null;
    const l = loc();
    consume(); // 'def'
    const idTok = consume(TOKEN_TYPES.IDENT);
    expect(TOKEN_TYPES.LBRACE, undefined, `Expected '{' for def '${idTok?.value}'`);
    const nodes = parseSceneNodes();
    consume(TOKEN_TYPES.RBRACE);
    return { id: idTok?.value || 'unnamed_def', nodes, loc: l };
  }

  // Shared body parser for def/group bodies and the scene root.
  // Task 5 handles parts; Task 6 extends with group/instance.
  function parseSceneNodes() {
    const nodes = [];
    while (!at(TOKEN_TYPES.RBRACE, TOKEN_TYPES.EOF)) {
      if (atValue('part')) {
        const p = parsePart();
        if (p) nodes.push({ kind: 'part', part: p });
      } else {
        break;
      }
    }
    return nodes;
  }
```

In the Program section, parse defs between palette and parts, and thread the new fields:

```js
  const palette = (atValue('palette') ? parsePalette() : null) || {};
  const defs = [];
  while (atValue('def')) {
    const d = parseDef();
    if (d) defs.push(d);
  }
  const parts = [];
  while (atValue('part')) {
    const p = parsePart();
    if (p) parts.push(p);
  }
```

In the AST build, change `version` to `'1.2.0'` and add after `parts`:

```js
    defs,
    graphMode: defs.length > 0,
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js tests/codex/core/pixelbrain/scdl/scdl.parser.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
Expected: PASS. (If `scdl.parser.test.js` asserts `version === '1.1.0'`, update that assertion to `'1.2.0'` in the same commit — the version reflects grammar capability, packet IDs are unaffected and the invariance suite proves it.)

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/scdl.grammar.js tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js tests/codex/core/pixelbrain/scdl/scdl.parser.test.js
git commit -m "feat(scdl): v1.2 grammar — def blocks with local-space parts"
```

---

### Task 6: Grammar — `group`, `instance`, transform clause, `ast.roots`

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.grammar.js` (extend `parseSceneNodes`; add `parseGroup`, `parseInstance`, `parseTransformClause`; program + AST build)
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js` (extend)

**Interfaces:**
- Produces (consumed by Tasks 7–11):
  - transform record: `{ tx, ty, theta, sx, sy, mirror }` — defaults `{tx:0, ty:0, theta:0, sx:1, sy:1, mirror:null}`; parser adds `_missingAt: true` when an instance lacks the mandatory `at` (validate turns it into SCDL-019)
  - group node: `{ kind:'group', id, transform, children:[node], loc }`
  - instance node: `{ kind:'instance', ref, name:null|string, transform, materialOverride:null|string, loc }`
  - `ast.roots = [node...]` — full scene in declaration order (parts wrapped as `{kind:'part', part}`); present on every parse. `ast.parts` still lists **root-level parts only** (same object references) so the legacy pipeline and SemQuant see exactly what they see today.
  - `ast.graphMode = defs.length > 0 || roots.some(n => n.kind !== 'part')`

- [ ] **Step 1: Add failing tests to `scdl.graph-parser.test.js`**

```js
const GRAPH_SOURCE = `
asset forest canvas 64x48
palette { trunkc = #26180E  leafc = #14301E }
def tree {
  part trunk material bark { rect -1 0 3 8 trunkc }
  part canopy material pine_needle { circle 0 -4 radius 5 leafc }
}
part sky material void_cloth { rect 0 0 64 20 trunkc }
group forest at 0 24 {
  instance tree at 10 0
  instance tree as big at 30 2 rotate 8 scale 1.4 0.9 mirror x material icy_fire
  group hill at 44 4 rotate 90 {
    instance tree at 0 0 scale 0.7
  }
}
export json
`;

describe('SCDL v1.2 grammar — group/instance/transform', () => {
  it('parses groups, instances, and transform clauses', () => {
    const { ast, errors } = parseSCDL(GRAPH_SOURCE);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    expect(ast.graphMode).toBe(true);
    expect(ast.roots.map(n => n.kind)).toEqual(['part', 'group']);

    const forest = ast.roots[1];
    expect(forest.id).toBe('forest');
    expect(forest.transform).toEqual({ tx: 0, ty: 24, theta: 0, sx: 1, sy: 1, mirror: null });
    expect(forest.children.map(n => n.kind)).toEqual(['instance', 'instance', 'group']);

    const plain = forest.children[0];
    expect(plain).toMatchObject({ ref: 'tree', name: null, materialOverride: null });
    expect(plain.transform).toEqual({ tx: 10, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null });

    const big = forest.children[1];
    expect(big.name).toBe('big');
    expect(big.transform).toEqual({ tx: 30, ty: 2, theta: 8, sx: 1.4, sy: 0.9, mirror: 'x' });
    expect(big.materialOverride).toBe('icy_fire');

    const hill = forest.children[2];
    expect(hill.transform.theta).toBe(90);
    expect(hill.children[0].transform).toEqual({ tx: 0, ty: 0, theta: 0, sx: 0.7, sy: 0.7, mirror: null });
  });

  it('flags instance without at as _missingAt', () => {
    const { ast } = parseSCDL(
      'asset a canvas 8x8\ndef d { part p material gold { cell 0 0 #ffffff } }\ngroup g at 0 0 { instance d }\nexport json'
    );
    expect(ast.roots[0].children[0].transform._missingAt).toBe(true);
  });

  it('root parts remain in ast.parts by reference', () => {
    const { ast } = parseSCDL(GRAPH_SOURCE);
    expect(ast.parts).toHaveLength(1);
    expect(ast.parts[0]).toBe(ast.roots[0].part);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js`
Expected: FAIL — `ast.roots` undefined.

- [ ] **Step 3: Implement in `scdl.grammar.js`**

```js
  // ── transform clause (SCDL v1.2) ──
  // 'at' NUMBER NUMBER ['rotate' NUMBER] ['scale' NUMBER [NUMBER]] ['mirror' ('x'|'y'|'xy')]
  function parseTransformClause({ required = false } = {}) {
    const t = { tx: 0, ty: 0, theta: 0, sx: 1, sy: 1, mirror: null };
    if (atValue('at')) {
      consume();
      const xTok = consume(TOKEN_TYPES.INT);
      const yTok = consume(TOKEN_TYPES.INT);
      t.tx = xTok ? parseFloat(xTok.value) : 0;
      t.ty = yTok ? parseFloat(yTok.value) : 0;
    } else if (required) {
      t._missingAt = true;
    }
    if (atValue('rotate')) {
      consume();
      const dTok = consume(TOKEN_TYPES.INT);
      t.theta = dTok ? parseFloat(dTok.value) : 0;
    }
    if (atValue('scale')) {
      consume();
      const sxTok = consume(TOKEN_TYPES.INT);
      t.sx = sxTok ? parseFloat(sxTok.value) : 1;
      t.sy = t.sx;
      if (at(TOKEN_TYPES.INT)) {
        const syTok = consume(TOKEN_TYPES.INT);
        t.sy = syTok ? parseFloat(syTok.value) : t.sx;
      }
    }
    if (atValue('mirror')) {
      consume();
      const mTok = consume(TOKEN_TYPES.IDENT);
      t.mirror = ['x', 'y', 'xy'].includes(mTok?.value) ? mTok.value : null;
    }
    return t;
  }

  // ── group block (SCDL v1.2) ──
  function parseGroup() {
    if (!atValue('group')) return null;
    const l = loc();
    consume(); // 'group'
    const idTok = consume(TOKEN_TYPES.IDENT);
    const transform = parseTransformClause();
    expect(TOKEN_TYPES.LBRACE, undefined, `Expected '{' for group '${idTok?.value}'`);
    const children = parseSceneNodes();
    consume(TOKEN_TYPES.RBRACE);
    return { kind: 'group', id: idTok?.value || 'unnamed_group', transform, children, loc: l };
  }

  // ── instance statement (SCDL v1.2) ──
  // 'instance' IDENT ['as' IDENT] transform ['material' IDENT]
  function parseInstance() {
    if (!atValue('instance')) return null;
    const l = loc();
    consume(); // 'instance'
    const refTok = consume(TOKEN_TYPES.IDENT);
    let name = null;
    if (atValue('as')) {
      consume();
      const nTok = consume(TOKEN_TYPES.IDENT);
      name = nTok?.value || null;
    }
    const transform = parseTransformClause({ required: true });
    let materialOverride = null;
    if (atValue('material')) {
      consume();
      const mTok = consume(TOKEN_TYPES.IDENT);
      materialOverride = mTok?.value || null;
    }
    return { kind: 'instance', ref: refTok?.value || 'unknown', name, transform, materialOverride, loc: l };
  }
```

**Disambiguation note:** inside a group/def body, an old-style `instance` *part op* cannot occur (part ops live inside `part { }` braces), so the statement form is unambiguous here. The part-op form (`scdl.grammar.js:393`) is untouched.

Extend `parseSceneNodes` (from Task 5):

```js
  function parseSceneNodes() {
    const nodes = [];
    while (!at(TOKEN_TYPES.RBRACE, TOKEN_TYPES.EOF)) {
      if (atValue('part')) {
        const p = parsePart();
        if (p) nodes.push({ kind: 'part', part: p });
      } else if (atValue('group')) {
        const g = parseGroup();
        if (g) nodes.push(g);
      } else if (atValue('instance')) {
        const i = parseInstance();
        if (i) nodes.push(i);
      } else {
        break;
      }
    }
    return nodes;
  }
```

Program section — replace the parts-only loop with a scene loop (root `instance` is accepted as a superset of the spec's `scene_item`; note recorded in spec update, Task 12):

```js
  const roots = [];
  while (atValue('part') || atValue('group') || atValue('instance')) {
    if (atValue('part')) {
      const p = parsePart();
      if (p) roots.push({ kind: 'part', part: p });
    } else if (atValue('group')) {
      const g = parseGroup();
      if (g) roots.push(g);
    } else {
      const i = parseInstance();
      if (i) roots.push(i);
    }
  }
  const parts = roots.filter(n => n.kind === 'part').map(n => n.part);
```

AST build:

```js
    defs,
    roots,
    graphMode: defs.length > 0 || roots.some(n => n.kind !== 'part'),
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js tests/codex/core/pixelbrain/scdl/scdl.parser.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/scdl.grammar.js tests/codex/core/pixelbrain/scdl/scdl.graph-parser.test.js
git commit -m "feat(scdl): v1.2 grammar — group/instance statements, transform clause, ast.roots"
```

---

### Task 7: graph-walk helper + validate extensions

**Files:**
- Create: `codex/core/pixelbrain/scdl/graph-walk.js`
- Modify: `codex/core/pixelbrain/scdl/passes/validate.pass.js`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-validate.test.js`

**Interfaces:**
- `graph-walk.js` produces (consumed by Tasks 8, 9):
  - `walkSceneNodes(ast, fn)` — depth-first over `ast.roots` and every `ast.defs[i].nodes`, calling `fn(node, containerKind)` where `containerKind` is `'root'`, `'def'`, or `'group'`
  - `mapParts(nodes, mapPartFn)` — returns a new node array with every `{kind:'part'}` node's part replaced by `mapPartFn(part)`, recursing through groups
- `validate.pass.js` additions:
  - duplicate ids in a shared per-scope namespace (part ids, group ids, instance `as` names) → SCDL-009
  - transform checks → SCDL-019: any of tx/ty/theta/sx/sy non-finite, `sx === 0 || sy === 0`, or `_missingAt`
  - op-verb validation (`KNOWN_OPS`) extended to def/group parts via `walkSceneNodes`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { validatePass } from '../../../../../codex/core/pixelbrain/scdl/passes/validate.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

function validate(source) {
  const { rawAst } = parseSCDL(source);
  const errors = [];
  validatePass(rawAst, errors);
  return errors;
}

describe('validate pass — scene-graph extensions', () => {
  it('SCDL-019 on scale 0', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 1 1 scale 0 }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.INVALID_TRANSFORM)).toBe(true);
  });

  it('SCDL-019 on instance missing at', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.INVALID_TRANSFORM)).toBe(true);
  });

  it('SCDL-009 when a group id collides with a part id at the same scope', () => {
    const errors = validate(`asset a canvas 8x8
part torso material gold { cell 0 0 #ffffff }
group torso at 0 0 { }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DUPLICATE_PART_ID)).toBe(true);
  });

  it('unknown op verbs inside def parts are caught', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { wobble 1 2 } }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_VERB)).toBe(true);
  });

  it('clean graph source validates with no errors', () => {
    const errors = validate(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 1 1 rotate 45 scale 1.5 mirror xy }
export json`);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-validate.test.js`
Expected: FAIL (scale-0 / missing-at / collision tests).

- [ ] **Step 3: Create `codex/core/pixelbrain/scdl/graph-walk.js`**

```js
/**
 * SCDL Graph Walk — shared traversal helpers for scene-graph ASTs.
 * Pure functions; no pass logic lives here.
 */

/** Depth-first visit of every scene node in roots and def bodies. */
export function walkSceneNodes(ast, fn) {
  const visit = (nodes, containerKind) => {
    for (const node of nodes || []) {
      fn(node, containerKind);
      if (node.kind === 'group') visit(node.children, 'group');
    }
  };
  visit(ast.roots || [], 'root');
  for (const def of ast.defs || []) visit(def.nodes, 'def');
}

/** Immutably map every part in a node array (recursing through groups). */
export function mapParts(nodes, mapPartFn) {
  return (nodes || []).map(node => {
    if (node.kind === 'part') return { ...node, part: mapPartFn(node.part) };
    if (node.kind === 'group') return { ...node, children: mapParts(node.children, mapPartFn) };
    return node;
  });
}
```

- [ ] **Step 4: Extend `validate.pass.js`**

Add imports: `walkSceneNodes` from `../graph-walk.js`. After the existing per-part loop (which keeps handling `ast.parts` for legacy paths), append:

```js
  // ── SCDL v1.2 scene-graph structural checks ──────────────────────────────
  if (ast.graphMode) {
    // 4b — op verbs + vector params inside def/group parts (root parts were
    // already covered by the ast.parts loop above; skip them here)
    walkSceneNodes(ast, (node, containerKind) => {
      if (node.kind === 'part' && containerKind !== 'root') {
        for (const op of (node.part.ops || [])) {
          if (!KNOWN_OPS.has(op.op)) {
            errors.push(scdlError(
              `Unknown op '${op.op}' in part '${node.part.id}'`,
              SCDL_ERROR_CODES.UNKNOWN_VERB, op.loc || l, { op: op.op, partId: node.part.id }
            ));
          }
          validateVectorOp(op, node.part, errors, l);
        }
      }
      // transform sanity (groups + instances)
      const t = node.transform;
      if (t) {
        const bad =
          t._missingAt ||
          ![t.tx, t.ty, t.theta, t.sx, t.sy].every(Number.isFinite) ||
          t.sx === 0 || t.sy === 0;
        if (bad) {
          errors.push(scdlError(
            t._missingAt
              ? `Instance '${node.ref || node.id}' is missing its mandatory 'at x y' clause`
              : `Invalid transform on '${node.id || node.ref}' — params must be finite, scale nonzero`,
            SCDL_ERROR_CODES.INVALID_TRANSFORM, node.loc || l,
            { node: node.id || node.ref, transform: { ...t } }
          ));
        }
      }
    });

    // Shared id namespace per scope (root scope + each group + each def body)
    const checkScope = (nodes, scopeLabel) => {
      const seenIds = new Set();
      for (const node of nodes || []) {
        const id = node.kind === 'part' ? node.part.id
                 : node.kind === 'group' ? node.id
                 : node.name; // instance: only named instances claim an id
        if (id) {
          if (seenIds.has(id)) {
            errors.push(scdlError(
              `Duplicate node id '${id}' in ${scopeLabel}`,
              SCDL_ERROR_CODES.DUPLICATE_PART_ID, node.loc || l, { partId: id, scope: scopeLabel }
            ));
          }
          seenIds.add(id);
        }
        if (node.kind === 'group') checkScope(node.children, `group '${node.id}'`);
      }
    };
    checkScope(ast.roots, 'scene root');
    for (const def of (ast.defs || [])) checkScope(def.nodes, `def '${def.id}'`);
  }
```

(Scope note: root parts appear in both `ast.parts` and `ast.roots`; the existing
duplicate-ID loop over `ast.parts` stays as-is, and `checkScope` on the root
scope re-checks parts *plus* groups/instances. A root duplicate part id will be
reported twice — acceptable; both point at the same authoring bug.)

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-validate.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js tests/codex/core/pixelbrain/scdl/scdl.compiler.test.js`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/scdl/graph-walk.js codex/core/pixelbrain/scdl/passes/validate.pass.js tests/codex/core/pixelbrain/scdl/scdl.graph-validate.test.js
git commit -m "feat(scdl): graph-walk helpers + validate extensions (SCDL-019, shared id namespace)"
```

---

### Task 8: resolve-colors / resolve-materials walk the graph

**Files:**
- Modify: `codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js:81-99`
- Modify: `codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js:19-33`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-resolve.test.js`

**Interfaces:**
- Consumes: `mapParts` from `graph-walk.js` (Task 7).
- Produces: for graph ASTs, every part inside `ast.defs[].nodes` and `ast.roots` (recursively) has `op.color` / `op.tierColors` resolved and `part.material` normalized; every instance node's `materialOverride` is registry-normalized (unknown → SCDL-005 WARN + `'source'`). `ast.parts` is rebuilt from the mapped roots so root-part object identity stays consistent. Legacy ASTs (`graphMode` false) take the exact existing code path.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { resolveColorsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js';
import { resolveMaterialsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

const SRC = `
asset a canvas 16x16
palette { leafc = #14301E }
def tree {
  part canopy material pine_needle { circle 0 0 radius 3 leafc }
}
group g at 4 4 { instance tree at 0 0 material not_a_material }
export json
`;

describe('resolve passes — graph traversal', () => {
  it('resolves palette aliases inside def parts', () => {
    const { rawAst } = parseSCDL(SRC);
    const errors = [];
    const ast = resolveColorsPass(rawAst, errors);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    const canopyOp = ast.defs[0].nodes[0].part.ops[0];
    expect(canopyOp.color).toBe('#14301E');
    expect(canopyOp.colorRef).toBeUndefined();
  });

  it('normalizes def part materials and instance overrides (SCDL-005 warn)', () => {
    const { rawAst } = parseSCDL(SRC);
    const errors = [];
    const ast = resolveMaterialsPass(rawAst, errors);
    expect(ast.defs[0].nodes[0].part.material).toBe('pine_needle');
    const inst = ast.roots.find(n => n.kind === 'group').children[0];
    expect(inst.materialOverride).toBe('source'); // fallback
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_MATERIAL)).toBe(true);
  });

  it('undefined alias inside a def errors (SCDL-006)', () => {
    const { rawAst } = parseSCDL(
      'asset a canvas 8x8\ndef d { part p material gold { cell 0 0 ghost } }\ngroup g at 0 0 { instance d at 0 0 }\nexport json'
    );
    const errors = [];
    resolveColorsPass(rawAst, errors);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNDEFINED_PALETTE_REF)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-resolve.test.js`
Expected: FAIL — def ops keep `colorRef`.

- [ ] **Step 3: Implement**

`resolve-colors.pass.js` — factor the existing part mapper into a named function and add the graph branch at the end (existing code above unchanged):

```js
  const resolvePart = part => ({
    ...part,
    ops: part.ops.map(op => {
      const opLoc = op.loc || l;
      if (op.colorRef) {
        return { ...op, color: resolveRef(op.colorRef, opLoc), colorRef: undefined };
      }
      if (op.tierColorRefs) {
        return {
          ...op,
          tierColors: op.tierColorRefs.map(r => resolveRef(r, opLoc)),
          tierColorRefs: undefined,
        };
      }
      return op;
    }),
  });

  if (!ast.graphMode) {
    return { ...ast, parts: ast.parts.map(resolvePart) };
  }

  const roots = mapParts(ast.roots, resolvePart);
  const defs = (ast.defs || []).map(def => ({ ...def, nodes: mapParts(def.nodes, resolvePart) }));
  return {
    ...ast,
    roots,
    defs,
    parts: roots.filter(n => n.kind === 'part').map(n => n.part),
  };
```

Add `import { mapParts } from '../graph-walk.js';` at the top.

`resolve-materials.pass.js` — same pattern plus instance overrides:

```js
import { resolveMaterialId } from '../../material-registry.js';
import { SCDL_ERROR_CODES, scdlWarn } from '../scdl.errors.js';
import { mapParts } from '../graph-walk.js';

export function resolveMaterialsPass(ast, errors) {
  const l = ast.sourceLocation || { line: 1, col: 1 };

  const resolvePart = part => {
    const resolved = resolveMaterialId(part.material);
    if (resolved !== part.material) {
      errors.push(scdlWarn(
        `Unknown material '${part.material}' in part '${part.id}' — falling back to '${resolved}'`,
        SCDL_ERROR_CODES.UNKNOWN_MATERIAL, part.loc || l,
        { material: part.material, fallback: resolved, partId: part.id }
      ));
    }
    return { ...part, material: resolved };
  };

  if (!ast.graphMode) {
    return { ...ast, parts: ast.parts.map(resolvePart) };
  }

  const resolveNodes = nodes => (nodes || []).map(node => {
    if (node.kind === 'part') return { ...node, part: resolvePart(node.part) };
    if (node.kind === 'group') return { ...node, children: resolveNodes(node.children) };
    if (node.kind === 'instance' && node.materialOverride) {
      const resolved = resolveMaterialId(node.materialOverride);
      if (resolved !== node.materialOverride) {
        errors.push(scdlWarn(
          `Unknown material '${node.materialOverride}' on instance '${node.name || node.ref}' — falling back to '${resolved}'`,
          SCDL_ERROR_CODES.UNKNOWN_MATERIAL, node.loc || l,
          { material: node.materialOverride, fallback: resolved, instance: node.name || node.ref }
        ));
      }
      return { ...node, materialOverride: resolved };
    }
    return node;
  });

  const roots = resolveNodes(ast.roots);
  const defs = (ast.defs || []).map(def => ({ ...def, nodes: resolveNodes(def.nodes) }));
  return {
    ...ast,
    roots,
    defs,
    parts: roots.filter(n => n.kind === 'part').map(n => n.part),
  };
}
```

(`mapParts` is imported by resolve-colors; resolve-materials uses its own
`resolveNodes` because it must also touch instance nodes.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-resolve.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js tests/codex/core/pixelbrain/scdl/`
Expected: PASS (full directory).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js tests/codex/core/pixelbrain/scdl/scdl.graph-resolve.test.js
git commit -m "feat(scdl): resolve colors/materials through defs, groups, instance overrides"
```

---

### Task 9: buildSceneGraphPass

**Files:**
- Create: `codex/core/pixelbrain/scdl/passes/build-scene-graph.pass.js`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.scene-graph-pass.test.js`

**Interfaces:**
- Consumes: `SCDL_ERROR_CODES` (Task 2), `matFromTransform`/`matMul`/`transformAABB`/`identity` (Task 3).
- Produces: `ast.sceneGraph` (consumed by Tasks 10, 11):

```js
{
  contract: 'PB-SCENE-GRAPH-v1',
  version:  '1.0.0',
  depthCap: 8,
  canvas:   { width, height },
  defs:     { [defId]: { nodes: [canonicalNode...] } },
  roots:    [canonicalNode...],
}
// canonicalNode (NO loc, NO annotations — identity-bearing fields only):
//   { kind:'part', id, material, ops:[canonicalOp...] }
//   { kind:'group', id, transform:{tx,ty,theta,sx,sy,mirror}, children:[...] }
//   { kind:'instance', ref, name, transform, materialOverride }
```

- Exports `DEPTH_CAP = 8` and `canonicalOp(op)` (reused by tests).
- Emits: SCDL-016 (unknown ref), SCDL-017 (cycle), SCDL-018 (depth > 8), SCDL-020 WARN (instance world-AABB misses canvas), SCDL-021 WARN (unreferenced def).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { parseSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.grammar.js';
import { resolveColorsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-colors.pass.js';
import { resolveMaterialsPass } from '../../../../../codex/core/pixelbrain/scdl/passes/resolve-materials.pass.js';
import { buildSceneGraphPass, DEPTH_CAP } from '../../../../../codex/core/pixelbrain/scdl/passes/build-scene-graph.pass.js';
import { SCDL_ERROR_CODES } from '../../../../../codex/core/pixelbrain/scdl/scdl.errors.js';

function build(source) {
  const { rawAst } = parseSCDL(source);
  const errors = [];
  let ast = resolveColorsPass(rawAst, errors);
  ast = resolveMaterialsPass(ast, errors);
  ast = buildSceneGraphPass(ast, errors);
  return { ast, errors };
}

const OK_SRC = `
asset a canvas 32x32
palette { c = #112233 }
def leaf { part p material gold { cell 0 0 c } }
def tree {
  part trunk material bark { rect 0 0 1 4 c }
  instance leaf at 0 -1
}
group g at 8 8 { instance tree at 2 2 rotate 90 }
export json
`;

describe('buildSceneGraphPass', () => {
  it('emits PB-SCENE-GRAPH-v1 with canonical nodes and no loc fields', () => {
    const { ast, errors } = build(OK_SRC);
    expect(errors.filter(e => e.severity === 'ERROR')).toEqual([]);
    const sg = ast.sceneGraph;
    expect(sg.contract).toBe('PB-SCENE-GRAPH-v1');
    expect(sg.depthCap).toBe(DEPTH_CAP);
    expect(Object.keys(sg.defs).sort()).toEqual(['leaf', 'tree']);
    expect(JSON.stringify(sg)).not.toMatch(/"loc"|"sourceSpan"|"annotations"/);
    const inst = sg.roots[0].children[0];
    expect(inst).toEqual({
      kind: 'instance', ref: 'tree', name: null,
      transform: { tx: 2, ty: 2, theta: 90, sx: 1, sy: 1, mirror: null },
      materialOverride: null,
    });
  });

  it('SCDL-016 on unknown def reference', () => {
    const { errors } = build('asset a canvas 8x8\ngroup g at 0 0 { instance ghost at 0 0 }\nexport json');
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.UNKNOWN_DEF_REF)).toBe(true);
  });

  it('SCDL-017 on def cycle', () => {
    const { errors } = build(`asset a canvas 8x8
def x { instance y at 0 0 }
def y { instance x at 0 0 }
group g at 0 0 { instance x at 0 0 }
export json`);
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DEF_CYCLE)).toBe(true);
  });

  it('SCDL-018 when expansion depth exceeds 8', () => {
    // Chain d1→d2→...→d9: instance at root(1) enters d1(2) ... d9(10) > 8
    const defs = [];
    for (let i = 9; i >= 1; i--) {
      defs.push(i === 9
        ? `def d9 { part p material gold { cell 0 0 #ffffff } }`
        : `def d${i} { instance d${i + 1} at 0 0 }`);
    }
    const { errors } = build(
      `asset a canvas 8x8\n${defs.reverse().join('\n')}\ngroup g at 0 0 { instance d1 at 0 0 }\nexport json`
    );
    expect(errors.some(e => e.code === SCDL_ERROR_CODES.DEPTH_CAP)).toBe(true);
  });

  it('SCDL-020 warn on instance fully off-canvas', () => {
    const { errors } = build(`asset a canvas 8x8
def d { part p material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance d at 100 100 }
export json`);
    const w = errors.find(e => e.code === SCDL_ERROR_CODES.DEAD_INSTANCE);
    expect(w).toBeDefined();
    expect(w.severity).toBe('WARN');
  });

  it('SCDL-021 warn on never-instanced def', () => {
    const { errors } = build(`asset a canvas 8x8
def unused { part p material gold { cell 0 0 #ffffff } }
part bg material gold { cell 1 1 #ffffff }
export json`);
    const w = errors.find(e => e.code === SCDL_ERROR_CODES.DEAD_DEF);
    expect(w).toBeDefined();
    expect(w.severity).toBe('WARN');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.scene-graph-pass.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `passes/build-scene-graph.pass.js`**

```js
/**
 * SCDL Build Scene Graph Pass (v1.2)
 *
 * Consumes a color/material-resolved graph AST and emits ast.sceneGraph
 * (PB-SCENE-GRAPH-v1): the canonical, identity-bearing program form.
 *
 * Laws enforced here:
 *  - SCDL-016 every instance ref resolves to a declared def
 *  - SCDL-017 the def-reference digraph is acyclic
 *  - SCDL-018 expansion depth ≤ DEPTH_CAP (8) — fail-closed bounded recursion
 *  - SCDL-020 WARN instance whose world AABB misses the canvas
 *  - SCDL-021 WARN def never reachable from the roots
 *
 * Canonical nodes carry NO source locations, NO semantic annotations —
 * the packet ID hashes this structure (spec §6 identity law).
 */

import { SCDL_ERROR_CODES, scdlError, scdlWarn } from '../scdl.errors.js';
import { identity, matFromTransform, matMul, transformAABB } from '../render/transform2d.js';

export const DEPTH_CAP = 8;

// Identity-bearing op fields per verb; everything else (loc, ids, annotations) is dropped.
const OP_FIELDS = Object.freeze({
  cell:     ['x', 'y', 'color'],
  line:     ['x0', 'y0', 'x1', 'y1', 'color'],
  rect:     ['x', 'y', 'w', 'h', 'color'],
  circle:   ['cx', 'cy', 'radius', 'color'],
  ellipse:  ['cx', 'cy', 'rx', 'ry', 'color'],
  ring:     ['cx', 'cy', 'radius', 'width', 'color'],
  polygon:  ['points', 'color'],
  path:     ['d', 'color'],
  sphere:   ['cx', 'cy', 'radius', 'lx', 'ly', 'tierColors'],
  symmetry: ['axis', 'count'],
  rim:      ['color', 'compass'],
  fill:     ['color'],
  glow:     ['radius'],
  trace:    ['source'],
});

export function canonicalOp(op) {
  const fields = OP_FIELDS[op.op];
  if (!fields) return { op: op.op };
  const out = { op: op.op };
  for (const f of fields) {
    if (op[f] !== undefined) out[f] = op[f];
  }
  return out;
}

function canonicalNodes(nodes) {
  return (nodes || []).map(node => {
    if (node.kind === 'part') {
      return {
        kind: 'part',
        id: node.part.id,
        material: node.part.material,
        ops: (node.part.ops || []).map(canonicalOp),
      };
    }
    if (node.kind === 'group') {
      return {
        kind: 'group',
        id: node.id,
        transform: canonicalTransform(node.transform),
        children: canonicalNodes(node.children),
      };
    }
    return {
      kind: 'instance',
      ref: node.ref,
      name: node.name ?? null,
      transform: canonicalTransform(node.transform),
      materialOverride: node.materialOverride ?? null,
    };
  });
}

function canonicalTransform(t = {}) {
  return {
    tx: t.tx ?? 0, ty: t.ty ?? 0, theta: t.theta ?? 0,
    sx: t.sx ?? 1, sy: t.sy ?? 1, mirror: t.mirror ?? null,
  };
}

// ── analysis helpers ─────────────────────────────────────────────────────────

function opAABB(op) {
  switch (op.op) {
    case 'cell': return { minX: op.x, minY: op.y, maxX: op.x + 1, maxY: op.y + 1 };
    case 'rect': return { minX: op.x, minY: op.y, maxX: op.x + op.w, maxY: op.y + op.h };
    case 'line': return {
      minX: Math.min(op.x0, op.x1), minY: Math.min(op.y0, op.y1),
      maxX: Math.max(op.x0, op.x1) + 1, maxY: Math.max(op.y0, op.y1) + 1,
    };
    case 'circle': case 'sphere':
      return { minX: op.cx - op.radius, minY: op.cy - op.radius, maxX: op.cx + op.radius + 1, maxY: op.cy + op.radius + 1 };
    case 'ring': {
      const r = op.radius + (op.width || 1) / 2;
      return { minX: op.cx - r, minY: op.cy - r, maxX: op.cx + r + 1, maxY: op.cy + r + 1 };
    }
    case 'ellipse':
      return { minX: op.cx - op.rx, minY: op.cy - op.ry, maxX: op.cx + op.rx + 1, maxY: op.cy + op.ry + 1 };
    case 'polygon': {
      const xs = (op.points || []).map(p => p[0]);
      const ys = (op.points || []).map(p => p[1]);
      if (!xs.length) return null;
      return { minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs) + 1, maxY: Math.max(...ys) + 1 };
    }
    default: return null; // path/fill/rim/glow/trace/symmetry — skip for AABB purposes
  }
}

function unionAABB(a, b) {
  if (!a) return b;
  if (!b) return a;
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

// Local AABB of a def body / node list (transforms of children applied).
function nodesAABB(nodes, defTable, seen = new Set()) {
  let box = null;
  for (const node of nodes || []) {
    if (node.kind === 'part') {
      // symmetry x/y/xy inside defs mirrors around local axes → reflect AABB
      let partBox = null;
      for (const op of node.part.ops || []) partBox = unionAABB(partBox, opAABB(op));
      const sym = (node.part.ops || []).filter(o => o.op === 'symmetry').pop();
      if (partBox && sym && (sym.axis === 'x' || sym.axis === 'xy')) {
        partBox = unionAABB(partBox, { minX: -partBox.maxX, minY: partBox.minY, maxX: -partBox.minX, maxY: partBox.maxY });
      }
      if (partBox && sym && (sym.axis === 'y' || sym.axis === 'xy')) {
        partBox = unionAABB(partBox, { minX: partBox.minX, minY: -partBox.maxY, maxX: partBox.maxX, maxY: -partBox.minY });
      }
      box = unionAABB(box, partBox);
    } else if (node.kind === 'group') {
      const childBox = nodesAABB(node.children, defTable, seen);
      if (childBox) box = unionAABB(box, transformAABB(matFromTransform(node.transform), childBox));
    } else if (node.kind === 'instance') {
      const def = defTable.get(node.ref);
      if (def && !seen.has(node.ref)) {
        seen.add(node.ref); // cycle guard (real cycles already errored)
        const defBox = nodesAABB(def.nodes, defTable, seen);
        seen.delete(node.ref);
        if (defBox) box = unionAABB(box, transformAABB(matFromTransform(node.transform), defBox));
      }
    }
  }
  return box;
}

/**
 * @param {object} ast - color/material-resolved graph AST
 * @param {import('../scdl.errors.js').SCDLError[]} errors
 */
export function buildSceneGraphPass(ast, errors) {
  if (!ast.graphMode) return ast;
  const l = ast.sourceLocation || { line: 1, col: 1 };
  const defTable = new Map((ast.defs || []).map(d => [d.id, d]));

  // ── SCDL-016: every ref resolves ──
  const eachInstance = (nodes, fn) => {
    for (const node of nodes || []) {
      if (node.kind === 'instance') fn(node);
      if (node.kind === 'group') eachInstance(node.children, fn);
    }
  };
  const allScopes = [ast.roots, ...(ast.defs || []).map(d => d.nodes)];
  let refsOk = true;
  for (const scope of allScopes) {
    eachInstance(scope, node => {
      if (!defTable.has(node.ref)) {
        refsOk = false;
        errors.push(scdlError(
          `Instance references undeclared def '${node.ref}'`,
          SCDL_ERROR_CODES.UNKNOWN_DEF_REF, node.loc || l, { ref: node.ref }
        ));
      }
    });
  }
  if (!refsOk) return ast;

  // ── SCDL-017: acyclicity of def→def edges ──
  const VISITING = 1, DONE = 2;
  const state = new Map();
  let cyclic = false;
  const visitDef = (id, path) => {
    if (state.get(id) === DONE || cyclic) return;
    if (state.get(id) === VISITING) {
      cyclic = true;
      errors.push(scdlError(
        `Def reference cycle: ${[...path, id].join(' → ')}`,
        SCDL_ERROR_CODES.DEF_CYCLE, defTable.get(id)?.loc || l, { cycle: [...path, id] }
      ));
      return;
    }
    state.set(id, VISITING);
    eachInstance(defTable.get(id)?.nodes, node => visitDef(node.ref, [...path, id]));
    state.set(id, DONE);
  };
  for (const id of defTable.keys()) visitDef(id, []);
  if (cyclic) return ast;

  // ── SCDL-018: expansion depth (memoized def depths; acyclic by now) ──
  const defDepth = new Map();
  const depthOfNodes = nodes => {
    let max = 0;
    for (const node of nodes || []) {
      if (node.kind === 'part') max = Math.max(max, 1);
      else if (node.kind === 'group') max = Math.max(max, 1 + depthOfNodes(node.children));
      else max = Math.max(max, 1 + depthOfDef(node.ref));
    }
    return max;
  };
  const depthOfDef = id => {
    if (!defDepth.has(id)) defDepth.set(id, depthOfNodes(defTable.get(id).nodes));
    return defDepth.get(id);
  };
  const totalDepth = depthOfNodes(ast.roots);
  if (totalDepth > DEPTH_CAP) {
    errors.push(scdlError(
      `Scene graph depth ${totalDepth} exceeds cap ${DEPTH_CAP}`,
      SCDL_ERROR_CODES.DEPTH_CAP, l, { depth: totalDepth, cap: DEPTH_CAP }
    ));
    return ast;
  }

  // ── SCDL-021: dead defs (unreachable from roots) ──
  const reachable = new Set();
  const markFrom = nodes => eachInstance(nodes, node => {
    if (!reachable.has(node.ref)) {
      reachable.add(node.ref);
      markFrom(defTable.get(node.ref).nodes);
    }
  });
  markFrom(ast.roots);
  for (const def of ast.defs || []) {
    if (!reachable.has(def.id)) {
      errors.push(scdlWarn(
        `Def '${def.id}' is declared but never instanced`,
        SCDL_ERROR_CODES.DEAD_DEF, def.loc || l, { def: def.id }
      ));
    }
  }

  // ── SCDL-020: dead instances (world AABB misses canvas) — roots only ──
  const { width: W, height: H } = ast.canvas;
  const checkDead = (nodes, parentM) => {
    for (const node of nodes || []) {
      if (node.kind === 'group') {
        checkDead(node.children, matMul(parentM, matFromTransform(node.transform)));
      } else if (node.kind === 'instance') {
        const localBox = nodesAABB(defTable.get(node.ref).nodes, defTable);
        if (localBox) {
          const M = matMul(parentM, matFromTransform(node.transform));
          const w = transformAABB(M, localBox);
          if (w.maxX <= 0 || w.maxY <= 0 || w.minX >= W || w.minY >= H) {
            errors.push(scdlWarn(
              `Instance '${node.name || node.ref}' is fully outside the ${W}x${H} canvas`,
              SCDL_ERROR_CODES.DEAD_INSTANCE, node.loc || l,
              { ref: node.ref, worldAABB: w }
            ));
          }
        }
      }
    }
  };
  checkDead(ast.roots, identity());

  // ── Canonical program form ──
  const sceneGraph = {
    contract: 'PB-SCENE-GRAPH-v1',
    version:  '1.0.0',
    depthCap: DEPTH_CAP,
    canvas:   { width: W, height: H },
    defs: Object.fromEntries(
      (ast.defs || []).map(d => [d.id, { nodes: canonicalNodes(d.nodes) }])
    ),
    roots: canonicalNodes(ast.roots),
  };

  return { ...ast, sceneGraph };
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.scene-graph-pass.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/passes/build-scene-graph.pass.js tests/codex/core/pixelbrain/scdl/scdl.scene-graph-pass.test.js
git commit -m "feat(scdl): buildSceneGraphPass — PB-SCENE-GRAPH-v1 IR, SCDL-016..021 enforcement"
```

---

### Task 10: Compiler branch + scene-graph packet emission + identity law

**Files:**
- Modify: `codex/core/pixelbrain/pixelbrain-asset-packet.js:23-28` (export `stableJson`), `:146-165` (preserve `sceneGraph` in `normalizeGeometry`)
- Modify: `codex/core/pixelbrain/scdl/passes/emit-packet.pass.js`
- Modify: `codex/core/pixelbrain/scdl/scdl.compiler.js:104-117` (frames guard), `:165-197` (`_runFramePipeline` branch)
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-compile.test.js`

**Interfaces:**
- Consumes: `buildSceneGraphPass` (Task 9).
- Produces (consumed by Tasks 11, 12):
  - `stableJson(value)` exported from `pixelbrain-asset-packet.js` (existing private fn at line 23, now `export function stableJson`)
  - graph packets: `packet.geometry.mode === 'scene-graph'`, `packet.geometry.sceneGraph` present, `packet.geometry.coordinates` empty, `packet.id = 'pbasset_' + hashString(stableJson(sceneGraph)).toString(16).padStart(8, '0')`
  - compiling a graph asset that also declares frames → SCDL-013 ERROR with message `Scene-graph assets do not support frames yet (planned: PR-3)`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { stableJson } from '../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';
import { hashString } from '../../../../../codex/core/pixelbrain/shared.js';

const GRAPH_SRC = `
asset duo canvas 32x32
palette { c = #204060 }
def dot { part p material gold { circle 0 0 radius 2 c } }
group g at 8 8 {
  instance dot at 0 0
  instance dot at 10 4 rotate 45 scale 1.5
}
export json
`;

describe('graph compile — packet contract and identity law', () => {
  it('emits a scene-graph packet with no stored pixels', () => {
    const r = compileSCDL(GRAPH_SRC);
    expect(r.ok).toBe(true);
    expect(r.packet.geometry.mode).toBe('scene-graph');
    expect(r.packet.geometry.sceneGraph.contract).toBe('PB-SCENE-GRAPH-v1');
    expect(r.packet.geometry.coordinates).toHaveLength(0);
  });

  it('packet ID hashes the canonical program (formula bytes)', () => {
    const r = compileSCDL(GRAPH_SRC);
    const expected = `pbasset_${hashString(stableJson(r.packet.geometry.sceneGraph)).toString(16).padStart(8, '0')}`;
    expect(r.packet.id).toBe(expected);
  });

  it('same program → same ID; added instance → different ID; comments → same ID', () => {
    const a = compileSCDL(GRAPH_SRC);
    const b = compileSCDL(GRAPH_SRC + '\n# a trailing comment\n');
    const c = compileSCDL(GRAPH_SRC.replace('instance dot at 0 0', 'instance dot at 0 0\n  instance dot at 5 5'));
    expect(b.packet.id).toBe(a.packet.id);
    expect(c.packet.id).not.toBe(a.packet.id);
  });

  it('flat assets are untouched (mode coordinates, same pipeline)', () => {
    const r = compileSCDL('asset flat canvas 8x8\npart p material gold { cell 1 1 #ffffff }\nexport json');
    expect(r.packet.geometry.mode).toBe('coordinates');
    expect(r.packet.geometry.sceneGraph).toBeUndefined();
  });

  it('graph + frames errors with the PR-3 message', () => {
    const r = compileSCDL(GRAPH_SRC + '\nloop idle duration 100\nframe 1 "x" { omit g }\n');
    expect(r.ok).toBe(false);
    expect(r.errors.some(e => /do not support frames yet/.test(e.message))).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-compile.test.js`
Expected: FAIL — `stableJson` not exported / mode is `coordinates`.

- [ ] **Step 3: Implement**

`pixelbrain-asset-packet.js` — line 23: `function stableJson` → `export function stableJson`. In `normalizeGeometry` (line 159), preserve the graph:

```js
  const sceneGraph = input.geometry?.sceneGraph || null;
  return Object.freeze({
    mode: input.geometry?.mode || (cells.length ? 'template-grid' : 'coordinates'),
    bounds: Object.freeze(clonePlain(input.geometry?.bounds || {})),
    coordinates: normalizedCoordinates,
    cells: Object.freeze(clonePlain(cells)),
    ...(sceneGraph ? { sceneGraph: Object.freeze(clonePlain(sceneGraph)) } : {}),
  });
```

`emit-packet.pass.js` — add imports and the graph branch at the top of `emitPacketPass`:

```js
import {
  createPixelBrainAssetPacket,
  normalizePixelBrainCanvas,
  stableJson,
} from '../../pixelbrain-asset-packet.js';
import { hashString } from '../../shared.js';

export function emitPacketPass(ast, _errors) {
  if (ast.sceneGraph) return emitSceneGraphPacket(ast);
  // ... existing body unchanged ...
}

function emitSceneGraphPacket(ast) {
  const canvas = normalizePixelBrainCanvas(ast.canvas);
  const sceneGraph = ast.sceneGraph;
  const id = `pbasset_${hashString(stableJson(sceneGraph)).toString(16).padStart(8, '0')}`;

  const paletteColors = Object.values(ast.palette || {}).filter(Boolean);
  const sourcePalette = paletteColors.length
    ? [{ key: 'scdl-source', colors: paletteColors, source: 'scdl', weights: [] }]
    : [];

  const countNodes = nodes => (nodes || []).reduce(
    (n, node) => n + 1 + (node.kind === 'group' ? countNodes(node.children) : 0), 0
  );

  return createPixelBrainAssetPacket({
    id, // identity law: hash of the canonical program, never pixels
    canvas,
    geometry: { mode: 'scene-graph', sceneGraph, coordinates: [] },
    palette: { sourcePalette, authority: 'scdl.emit-packet.v1' },
    source: { kind: 'scdl', id: ast.asset, label: `SCDL:${ast.asset}` },
    material: { id: 'source' },
    provenance: {
      createdBy: 'scdl-compiler.v1',
      operations: [
        { op: 'parse', checksum: ast.checksum },
        { op: 'semantic-unifier', schemaVersion: 'PB-SEM-v1' },
        { op: 'scene-graph', defCount: Object.keys(sceneGraph.defs).length, rootNodeCount: countNodes(sceneGraph.roots) },
      ],
    },
    metadata: {
      tags: ['scdl', 'scene-graph', ast.type],
      notes: [
        `SCDL scene-graph asset: ${ast.asset}`,
        `Canvas: ${canvas.width}x${canvas.height}`,
        `Defs: ${Object.keys(sceneGraph.defs).join(', ') || '(none)'}`,
      ],
    },
  });
}
```

`scdl.compiler.js` — import the pass:

```js
import { buildSceneGraphPass } from './passes/build-scene-graph.pass.js';
```

Frames guard, immediately after the `expandFramesPass` block (line ~104):

```js
  if (frameExpansion.hasFrames && ast.graphMode) {
    errors.push(scdlError(
      'Scene-graph assets do not support frames yet (planned: PR-3)',
      SCDL_ERROR_CODES.FRAME_INDEX_LAW, { line: 1, col: 1 },
      { reason: 'graph-frames-pr3' }
    ));
    return _failResult(errors, ast, source);
  }
```

`_runFramePipeline` — branch after `resolveMaterials`:

```js
  ast = _runPass('resolveMaterials', ast, errors, resolveMaterialsPass);
  // Material warnings are non-fatal

  if (ast.graphMode) {
    ast = _runPass('buildSceneGraph', ast, errors, buildSceneGraphPass);
    if (_hasFatal(errors)) return { ast, packet: null, fatal: true };
    let packet = null;
    try {
      packet = emitPacketPass(ast, errors);
    } catch (e) {
      errors.push(scdlError(
        `Packet emit failed: ${e.message}`,
        SCDL_ERROR_CODES.MISSING_ASSET, { line: 1, col: 1 }, { thrown: String(e) }
      ));
      return { ast, packet: null, fatal: true };
    }
    return { ast, packet, fatal: false };
  }

  ast = _runPass('expandVector', ast, errors, expandVectorPass);
  // ... existing flat path unchanged ...
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: ALL PASS (graph-compile new, invariance and all legacy suites green).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/pixelbrain-asset-packet.js codex/core/pixelbrain/scdl/passes/emit-packet.pass.js codex/core/pixelbrain/scdl/scdl.compiler.js tests/codex/core/pixelbrain/scdl/scdl.graph-compile.test.js
git commit -m "feat(scdl): scene-graph packet mode + formula-bytes identity law; graph pipeline branch"
```

---

### Task 11: Forward renderer (geometry stage)

**Files:**
- Create: `codex/core/pixelbrain/scene-graph-renderer.js`
- Test: `tests/codex/core/pixelbrain/scdl/scdl.renderer.test.js`

**Interfaces:**
- Consumes: `transform2d.js` (Task 3), `raster-core.js` (Task 4), `applySymmetryToLattice` from `codex/core/pixelbrain/symmetry-amp.js` (existing).
- Produces (consumed by Task 12):
  - `renderSceneGraph(sceneGraph, canvas, options = {}) → { width, height, pixels: Uint32Array, cellIndex }`
    - `pixels[i]` packed `(r<<24 | g<<16 | b<<8 | a) >>> 0`, row-major; `a` is 0 (empty) or 255
    - `options.shade`: `'geometry'` (default and only PR-1 mode; `'full'` throws `Error('shade "full" lands in PR-2')`)
    - `options.semantics`: when true, `cellIndex` is an array (same indexing as pixels) of `{ partId, material, role, sourceOpId } | null`; otherwise `cellIndex` is `null`
  - `framebufferToCoordinates(fb) → [{x, y, color}]` — row-major, hex colors, skips empty pixels
- **Rendering laws implemented:** painter order = node order, depth-first; `M_world = M_parent · M_local`; inverse-mapped sampling at `(x+0.5, y+0.5)` with `floor` lookup; integer-translation fast path; def/group part `symmetry` mirrors around local axes (negation), scene-root part `symmetry` keeps canvas semantics via `applySymmetryToLattice`; `fill`/`glow`/`trace` ops are carried but not rasterized in PR-1; `rim` rasterizes only for scene-root parts (canvas edges).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { renderSceneGraph, framebufferToCoordinates } from '../../../../../codex/core/pixelbrain/scene-graph-renderer.js';

function render(source, options) {
  const r = compileSCDL(source);
  expect(r.ok).toBe(true);
  return renderSceneGraph(r.packet.geometry.sceneGraph, r.packet.canvas, options);
}
const px = (fb, x, y) => fb.pixels[y * fb.width + x];
const hex = v => `#${(v >>> 8).toString(16).padStart(6, '0')}`;

describe('scene-graph forward renderer (geometry)', () => {
  it('integer translation places def cells exactly (fast path)', () => {
    const fb = render(`asset a canvas 16x16
def dot { part p material gold { cell 0 0 #ff0000  cell 1 0 #00ff00 } }
group g at 4 4 { instance dot at 2 3 }
export json`);
    expect(hex(px(fb, 6, 7))).toBe('#ff0000');  // (0,0) + at(2,3) + group(4,4)
    expect(hex(px(fb, 7, 7))).toBe('#00ff00');
    expect(px(fb, 0, 0)).toBe(0);
  });

  it('painter order: later instance paints over earlier', () => {
    const fb = render(`asset a canvas 8x8
def r { part p material gold { rect 0 0 2 2 #ff0000 } }
def b { part p material gold { rect 0 0 2 2 #0000ff } }
group g at 0 0 { instance r at 2 2  instance b at 3 3 }
export json`);
    expect(hex(px(fb, 3, 3))).toBe('#0000ff'); // overlap goes to the later node
    expect(hex(px(fb, 2, 2))).toBe('#ff0000');
  });

  it('rotation is hole-free: rotated disc has no interior gaps', () => {
    for (const theta of [7, 33, 45]) {
      const fb = render(`asset a canvas 40x40
def disc { part p material gold { circle 0 0 radius 8 #ffffff } }
group g at 0 0 { instance disc at 20 20 rotate ${theta} }
export json`);
      // every pixel strictly inside radius 6 of (20,20) must be filled
      for (let y = 15; y <= 25; y++) {
        for (let x = 15; x <= 25; x++) {
          if ((x - 20) ** 2 + (y - 20) ** 2 <= 36) {
            expect(px(fb, x, y), `hole at ${x},${y} theta ${theta}`).not.toBe(0);
          }
        }
      }
    }
  });

  it('scale works both directions', () => {
    const fb = render(`asset a canvas 32x32
def dot { part p material gold { rect 0 0 2 2 #ffffff } }
group g at 0 0 { instance dot at 4 4 scale 3 }
export json`);
    // 2x2 rect scaled 3x → covers world [4,10) x [4,10)
    expect(px(fb, 4, 4)).not.toBe(0);
    expect(px(fb, 9, 9)).not.toBe(0);
    expect(px(fb, 10, 10)).toBe(0);
  });

  it('def symmetry mirrors around LOCAL x=0', () => {
    const fb = render(`asset a canvas 16x16
def wing { part p material gold { symmetry x  cell 2 0 #ffffff } }
group g at 0 0 { instance wing at 8 8 }
export json`);
    expect(px(fb, 10, 8)).not.toBe(0); // +2
    expect(px(fb, 6, 8)).not.toBe(0);  // -2 mirrored
  });

  it('determinism: two renders produce identical bytes', () => {
    const src = `asset a canvas 24x24
def t { part p material gold { circle 0 0 radius 3 #123456 } }
group g at 2 2 { instance t at 5 5 rotate 33 scale 1.3 }
export json`;
    const a = render(src);
    const b = render(src);
    expect(Buffer.from(a.pixels.buffer).equals(Buffer.from(b.pixels.buffer))).toBe(true);
  });

  it('semantics cellIndex carries instance-path sourceOpId', () => {
    const fb = render(`asset a canvas 8x8
def dot { part core material gold { cell 0 0 #ffffff } }
group g at 0 0 { instance dot as d1 at 2 2 }
export json`, { semantics: true });
    const idx = fb.cellIndex[2 * 8 + 2];
    expect(idx.partId).toBe('core');
    expect(idx.sourceOpId).toBe('g/d1/core');
    expect(idx.material).toBe('gold');
  });

  it('framebufferToCoordinates round-trips filled pixels', () => {
    const fb = render(`asset a canvas 4x4
part p material gold { cell 1 2 #aabbcc }
group g at 0 0 { }
export json`);
    expect(framebufferToCoordinates(fb)).toEqual([{ x: 1, y: 2, color: '#aabbcc' }]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.renderer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `codex/core/pixelbrain/scene-graph-renderer.js`**

```js
/**
 * PixelBrain Scene-Graph Forward Renderer (PB-SCENE-GRAPH-v1)
 *
 * The runtime seam of SCDL v1.2: exporters call this at compile time and
 * runtimes call it on packet load. Formula → deterministic render; the
 * framebuffer is derived state, never canonical.
 *
 * Forward pipeline per node, depth-first, painter order:
 *   1. compose  M_world = M_parent · M_local
 *   2. rasterize memoized def-local cells → inverse-map into world space
 *      (integer translations take the exact lattice fast path)
 *   3. write, last write wins
 * Shading/transmutation/glow are PR-2 (`shade: 'full'`).
 *
 * Determinism: same sceneGraph + canvas → identical framebuffer bytes.
 */

import {
  identity, matFromTransform, matMul, matInvert, matApply,
  isIntegerTranslation, transformAABB,
} from './scdl/render/transform2d.js';
import {
  acceptAll, makeCanvasAccept,
  rasterizeCircle, rasterizeRing, rasterizeRect, rasterizePolygon,
  rasterizePath, rasterizeSphere, rasterizeEllipse, rasterizeLine,
} from './scdl/render/raster-core.js';
import { applySymmetryToLattice } from './symmetry-amp.js';

const VECTOR_RASTERIZERS = Object.freeze({
  circle: rasterizeCircle, ring: rasterizeRing, rect: rasterizeRect,
  polygon: rasterizePolygon, path: rasterizePath, sphere: rasterizeSphere,
  ellipse: rasterizeEllipse, line: rasterizeLine,
});

function hexToPacked(hexColor) {
  const raw = String(hexColor || '').replace('#', '');
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return 0;
  return ((parseInt(raw, 16) << 8) | 0xff) >>> 0;
}

export function framebufferToCoordinates(fb) {
  const out = [];
  for (let y = 0; y < fb.height; y++) {
    for (let x = 0; x < fb.width; x++) {
      const v = fb.pixels[y * fb.width + x];
      if ((v & 0xff) === 0) continue;
      out.push({ x, y, color: `#${(v >>> 8).toString(16).padStart(6, '0')}` });
    }
  }
  return out;
}

/**
 * Rasterize one canonical part into a local lattice.
 * @returns {{ cells: Map<string, {x:number,y:number,color:string}>, bounds: {minX,minY,maxX,maxY}|null }}
 */
function rasterizePartLocal(part, { atSceneRoot, canvas }) {
  const cellOps = [];
  const accept = atSceneRoot ? makeCanvasAccept(canvas.width, canvas.height) : acceptAll;

  for (const op of part.ops || []) {
    const raster = VECTOR_RASTERIZERS[op.op];
    if (raster) {
      raster({ ...op, partId: part.id, material: part.material }, accept, cellOps);
    } else if (op.op === 'cell') {
      if (accept(op.x, op.y)) cellOps.push({ x: op.x, y: op.y, color: op.color });
    } else if (op.op === 'rim' && atSceneRoot) {
      const { width: w, height: h } = canvas;
      const edges = {
        'north': () => Array.from({ length: w }, (_, x) => ({ x, y: 0 })),
        'south': () => Array.from({ length: w }, (_, x) => ({ x, y: h - 1 })),
        'west':  () => Array.from({ length: h }, (_, y) => ({ x: 0, y })),
        'east':  () => Array.from({ length: h }, (_, y) => ({ x: w - 1, y })),
      };
      const make = edges[op.compass] || edges.north;
      for (const { x, y } of make()) cellOps.push({ x, y, color: op.color });
    }
    // fill / glow / trace / symmetry: not rasterized here (symmetry below; rest PR-2+)
  }

  // symmetry: last declaration wins (mirrors legacy pass behavior)
  const sym = (part.ops || []).filter(o => o.op === 'symmetry').pop();
  let cells = new Map();
  for (const c of cellOps) cells.set(`${c.x},${c.y}`, { x: c.x, y: c.y, color: c.color });

  if (sym) {
    if (atSceneRoot) {
      // canvas-center law — delegate to SymmetryAMP exactly like the legacy pass
      const AXIS_MAP = { x: 'vertical', y: 'horizontal', xy: 'radial' };
      const lattice = {
        cols: canvas.width, rows: canvas.height,
        cells: new Map([...cells].map(([k, c]) => [k, { col: c.x, row: c.y, color: c.color, emphasis: 1 }])),
      };
      const mirrored = applySymmetryToLattice(lattice, {
        type: AXIS_MAP[sym.axis] || 'vertical', significant: true, confidence: 1.0,
      });
      cells = new Map();
      mirrored.cells.forEach(c => cells.set(`${c.col},${c.row}`, { x: c.col, y: c.row, color: c.color }));
    } else {
      // local-axes law — reflect through x=0 / y=0 (mirrors paint on top)
      const reflected = new Map(cells);
      for (const c of cells.values()) {
        if (sym.axis === 'x' || sym.axis === 'xy') reflected.set(`${-c.x},${c.y}`, { x: -c.x, y: c.y, color: c.color });
        if (sym.axis === 'y' || sym.axis === 'xy') reflected.set(`${c.x},${-c.y}`, { x: c.x, y: -c.y, color: c.color });
        if (sym.axis === 'xy') reflected.set(`${-c.x},${-c.y}`, { x: -c.x, y: -c.y, color: c.color });
      }
      cells = reflected;
    }
  }

  let bounds = null;
  for (const c of cells.values()) {
    if (!bounds) bounds = { minX: c.x, minY: c.y, maxX: c.x + 1, maxY: c.y + 1 };
    else {
      bounds.minX = Math.min(bounds.minX, c.x);
      bounds.minY = Math.min(bounds.minY, c.y);
      bounds.maxX = Math.max(bounds.maxX, c.x + 1);
      bounds.maxY = Math.max(bounds.maxY, c.y + 1);
    }
  }
  return { cells, bounds };
}

function paintLattice(fb, lattice, M, meta, cellIndex) {
  if (!lattice.bounds) return;
  const { width: W, height: H } = fb;

  const write = (x, y, cell) => {
    const i = y * W + x;
    fb.pixels[i] = hexToPacked(cell.color);
    if (cellIndex) {
      cellIndex[i] = {
        partId: meta.partId, material: meta.material,
        role: meta.role, sourceOpId: meta.sourceOpId,
      };
    }
  };

  if (isIntegerTranslation(M)) {
    for (const cell of lattice.cells.values()) {
      const x = cell.x + M.e, y = cell.y + M.f;
      if (x >= 0 && x < W && y >= 0 && y < H) write(x, y, cell);
    }
    return;
  }

  const Minv = matInvert(M);
  if (!Minv) return; // degenerate — validate already errored
  const world = transformAABB(M, lattice.bounds);
  const x0 = Math.max(0, Math.floor(world.minX));
  const y0 = Math.max(0, Math.floor(world.minY));
  const x1 = Math.min(W - 1, Math.ceil(world.maxX));
  const y1 = Math.min(H - 1, Math.ceil(world.maxY));

  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const [u, v] = matApply(Minv, x + 0.5, y + 0.5); // the Rounding Law
      const cell = lattice.cells.get(`${Math.floor(u)},${Math.floor(v)}`);
      if (cell) write(x, y, cell);
    }
  }
}

export function renderSceneGraph(sceneGraph, canvas, options = {}) {
  const shade = options.shade || 'geometry';
  if (shade === 'full') throw new Error('shade "full" lands in PR-2');
  if (!sceneGraph || sceneGraph.contract !== 'PB-SCENE-GRAPH-v1') {
    throw new Error('renderSceneGraph: expected a PB-SCENE-GRAPH-v1 sceneGraph');
  }

  const width = canvas.width, height = canvas.height;
  const fb = { width, height, pixels: new Uint32Array(width * height), cellIndex: null };
  const cellIndex = options.semantics ? new Array(width * height).fill(null) : null;
  fb.cellIndex = cellIndex;

  const partCache = new Map(); // `${cacheKey}` → lattice (defs rasterize once)

  const renderNodes = (nodes, M, path, atSceneRoot, cacheScope) => {
    for (const node of nodes || []) {
      if (node.kind === 'part') {
        const key = `${cacheScope}#${node.id}#${atSceneRoot}`;
        let lattice = partCache.get(key);
        if (!lattice) {
          lattice = rasterizePartLocal(node, { atSceneRoot, canvas });
          partCache.set(key, lattice);
        }
        paintLattice(fb, lattice, M, {
          partId: node.id, material: node.material, role: 'explicit',
          sourceOpId: path ? `${path}/${node.id}` : node.id,
        }, cellIndex);
      } else if (node.kind === 'group') {
        renderNodes(
          node.children,
          matMul(M, matFromTransform(node.transform)),
          path ? `${path}/${node.id}` : node.id,
          false,
          cacheScope
        );
      } else if (node.kind === 'instance') {
        const def = sceneGraph.defs[node.ref];
        if (!def) continue; // compile already errored SCDL-016
        renderNodes(
          def.nodes,
          matMul(M, matFromTransform(node.transform)),
          path ? `${path}/${node.name || node.ref}` : (node.name || node.ref),
          false,
          `def:${node.ref}`
        );
      }
    }
  };

  renderNodes(sceneGraph.roots, identity(), '', true, 'root');
  return fb;
}
```

**Note on `atSceneRoot`:** only the direct children of `roots` render with
`atSceneRoot === true`; anything under a group/instance uses local laws. The
part cache key includes the scope and root flag so a def's lattice is
rasterized once and shared across all its instances (the memoization law).

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.renderer.test.js tests/codex/core/pixelbrain/scdl/scdl.legacy-invariance.test.js`
Expected: PASS (8 renderer tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scene-graph-renderer.js tests/codex/core/pixelbrain/scdl/scdl.renderer.test.js
git commit -m "feat(pixelbrain): scene-graph forward renderer — inverse-mapped affine, painter order, memoized defs"
```

---

### Task 12: Exporters, forest_map fixture, CLI smoke, perf gate

**Files:**
- Modify: `codex/core/pixelbrain/scdl/scdl.exporters.js:23-45`
- Create: `codex/core/pixelbrain/scdl/fixtures/forest_map/forest_map.scdl`
- Modify: `docs/superpowers/specs/2026-07-03-scdl-scene-graph-design.md` (§3 EBNF: `scene_item ::= part_block | group_block | instance_stmt` — record the superset decision)
- Test: `tests/codex/core/pixelbrain/scdl/scdl.graph-exports.test.js`

**Interfaces:**
- Consumes: `renderSceneGraph`, `framebufferToCoordinates` (Task 11).
- Produces: `exportSCDL` handles graph packets — `json` emits the compact packet; `svg`/`png`/`phaser` rasterize through the forward renderer; `aseprite` returns `{ok: false}` with a PR-3 message. CLI needs no changes (it already writes whatever `exportSCDL` returns).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { exportSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.exporters.js';

const FIXTURES = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/scdl/fixtures'
);

describe('graph exports + forest_map fixture', () => {
  const source = readFileSync(join(FIXTURES, 'forest_map/forest_map.scdl'), 'utf8');

  it('forest_map compiles clean into a scene-graph packet', () => {
    const r = compileSCDL(source);
    expect(r.ok).toBe(true);
    expect(r.packet.geometry.mode).toBe('scene-graph');
    expect(r.packet.id).toMatch(/^pbasset_[0-9a-f]{8}$/);
  });

  it('json export is compact; png/svg/phaser rasterize; aseprite defers to PR-3', () => {
    const r = compileSCDL(source);
    const out = exportSCDL(r.packet, ['json', 'png', 'svg', 'phaser', 'aseprite'], r.ast);
    expect(out.json.ok).toBe(true);
    expect(out.json.output.length).toBeLessThan(100_000);
    expect(JSON.parse(out.json.output).geometry.sceneGraph.contract).toBe('PB-SCENE-GRAPH-v1');

    expect(out.png.ok).toBe(true);
    expect(out.png.output.slice(0, 4)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));

    expect(out.svg.ok).toBe(true);
    expect(out.svg.output).toContain('<rect');

    expect(out.phaser.ok).toBe(true);
    expect(JSON.parse(out.phaser.output).pixels.length).toBeGreaterThan(0);

    expect(out.aseprite.ok).toBe(false);
    expect(String(out.aseprite.output)).toMatch(/PR-3/);
  });

  it('flat packets still export identically (routing untouched)', () => {
    const r = compileSCDL('asset flat canvas 4x4\npart p material gold { cell 1 1 #aabbcc }\nexport json');
    const out = exportSCDL(r.packet, ['svg', 'png'], r.ast);
    expect(out.svg.output).toContain('fill="#aabbcc"');
    expect(out.png.ok).toBe(true);
  });

  it('perf gate: 512x288 with 100 instances — compile < 1s, packet < 100 KB', () => {
    const defs = `def tree {
  part trunk material bark { rect -1 0 3 10 #26180E }
  part canopy material pine_needle { circle 0 -4 radius 6 #14301E }
}`;
    const instances = Array.from({ length: 100 }, (_, i) =>
      `  instance tree at ${(i * 37) % 480 + 10} ${(i * 13) % 200 + 40} rotate ${(i * 7) % 360} scale ${1 + (i % 5) / 10}`
    ).join('\n');
    const src = `asset big_map canvas 512x288\n${defs}\ngroup all at 0 0 {\n${instances}\n}\nexport json`;

    const t0 = performance.now();
    const r = compileSCDL(src);
    const elapsed = performance.now() - t0;
    expect(r.ok).toBe(true);
    expect(elapsed).toBeLessThan(1000);
    expect(JSON.stringify(r.packet).length).toBeLessThan(100_000);
  });
});
```

- [ ] **Step 2: Create the fixture `codex/core/pixelbrain/scdl/fixtures/forest_map/forest_map.scdl`**

```scdl
# forest_map — SCDL v1.2 canonical scene-graph fixture (PR-1, geometry only)
asset forest_map canvas 160x90

palette {
  skyc    = #1B2A4A
  ridgec  = #16223C
  groundc = #101C2E
  trunkc  = #26180E
  leafc   = #14301E
  leafhi  = #23532F
}

def tree {
  part trunk material bark { rect -1 0 3 10 trunkc }
  part canopy material pine_needle {
    circle 0 -4 radius 6 leafc
    circle -2 -6 radius 3 leafhi
  }
}

def shrub {
  part blob material pine_needle {
    symmetry x
    circle 2 0 radius 2 leafc
  }
}

part sky material void_cloth { rect 0 0 160 50 skyc }
part ridge material darksteel { polygon 0 50 40 30 90 44 130 26 160 38 160 50 ridgec }
part ground material bark { rect 0 50 160 40 groundc }

group forest at 0 62 {
  instance tree at 22 0
  instance tree as leaning at 52 2 rotate 8 scale 1.2
  instance tree at 84 -2 mirror x
  group knoll at 116 4 rotate 3 {
    instance tree at 0 0 scale 0.8
    instance shrub at 14 6
  }
  instance shrub at 8 8 scale 1.5
}

export json png svg phaser
```

- [ ] **Step 3: Run to verify export tests fail**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/scdl.graph-exports.test.js`
Expected: FAIL — svg/png/phaser choke on empty coordinates (or export empty), aseprite doesn't defer.

- [ ] **Step 4: Implement in `scdl.exporters.js`**

Add imports:

```js
import { renderSceneGraph, framebufferToCoordinates } from '../scene-graph-renderer.js';
```

Replace the top of `exportSCDL`:

```js
export function exportSCDL(packet, targets, ast, options = {}) {
  const isGraph = packet?.geometry?.mode === 'scene-graph';
  const lattice = isGraph
    ? _latticeFromSceneGraph(packet)
    : emitLattice(packet, ast);
  const includeSemantic = options.includeSemantic || false;
  const results = {};

  for (const target of targets) {
    switch (target) {
      case 'json':   results[target] = exportJSON(packet, includeSemantic ? ast : null);    break;
      case 'svg':    results[target] = exportSVG(lattice, includeSemantic);    break;
      case 'phaser': results[target] = exportPhaser(lattice, includeSemantic); break;
      case 'png':    results[target] = exportPNG(lattice);    break;
      case 'aseprite':
        results[target] = isGraph
          ? { ok: false, output: 'aseprite export for scene-graph assets lands in PR-3', mimeType: 'text/plain' }
          : exportAseprite([packet], null, lattice.canvas);
        break;
      default:
        results[target] = { ok: false, output: `Unknown export target '${target}'`, mimeType: 'text/plain' };
    }
  }

  return results;
}

/** Forward-render a scene-graph packet into the lattice view exporters consume. */
function _latticeFromSceneGraph(packet) {
  const fb = renderSceneGraph(packet.geometry.sceneGraph, packet.canvas, { shade: 'geometry' });
  return Object.freeze({
    kind: packet.kind,
    id: packet.id,
    source: packet.source,
    canvas: { width: packet.canvas.width, height: packet.canvas.height },
    geometry: { mode: 'coordinates', coordinates: framebufferToCoordinates(fb) },
    palette: packet.palette?.sourcePalette?.[0]?.colors || [],
    _paletteMap: Object.freeze({}),
    parts: Object.freeze([]),
    provenance: packet.provenance,
    scdlSource: 'SCDL-AST-v1',
    regressionSeed: null,
  });
}
```

- [ ] **Step 5: Update the spec EBNF** — in `docs/superpowers/specs/2026-07-03-scdl-scene-graph-design.md` §3, change `scene_item    ::= part_block | group_block` to `scene_item    ::= part_block | group_block | instance_stmt` (implementation accepts root-level instances; painter slots at every level).

- [ ] **Step 6: Run the full suite + CLI smoke**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: ALL PASS.

Run: `node codex/core/pixelbrain/scdl/scdl.cli.js compile codex/core/pixelbrain/scdl/fixtures/forest_map/forest_map.scdl --export json,png,svg,phaser`
Expected: four `[SCDL] Written:` lines ending in `forest_map-json.json`, `forest_map-png.png`, `forest_map-svg.svg`, `forest_map-phaser.json`, then `[SCDL] Done. Packet ID: pbasset_…`. Visually confirm `forest_map-png.png` shows sky/ridge/ground with five trees/shrubs (one rotated, one mirrored).

- [ ] **Step 7: Commit**

```bash
git add codex/core/pixelbrain/scdl/scdl.exporters.js codex/core/pixelbrain/scdl/fixtures/forest_map/ docs/superpowers/specs/2026-07-03-scdl-scene-graph-design.md tests/codex/core/pixelbrain/scdl/scdl.graph-exports.test.js
git commit -m "feat(scdl): graph-aware exporters via forward renderer; forest_map fixture; perf gate"
```

---

## Completion checklist (PR-1 definition of done)

- [ ] `npx vitest run tests/codex/core/pixelbrain/scdl/` fully green
- [ ] `npx vitest run tests/` — no regressions outside scdl (packet factory change is additive; run the pixelbrain suite: `npx vitest run tests/pixelbrain/ tests/codex/`)
- [ ] `npm run scd64:intellisense` clean on the diff (project law — run before claiming done)
- [ ] Legacy invariance: all frozen IDs unchanged
- [ ] forest_map renders correctly via CLI (visual check of the PNG)
- [ ] Spec §3 EBNF updated with `instance_stmt` as scene item
```
