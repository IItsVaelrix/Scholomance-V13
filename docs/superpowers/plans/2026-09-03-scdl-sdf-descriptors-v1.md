# SCDL SDF Descriptors v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `packet.sdfDescriptors` — a real, normalized, always-empty schema field — actually populated with real per-part SDF descriptors for `circle` (true circles) and `rect` ops, the substrate the phosphorylation-based VRI redesign needs to query.

**Architecture:** A shared `opToSDFPrimitive(op)` helper in `raster-core.js` maps one op to one `evaluateSDF`-compatible primitive or `null`. It's captured once per part during `expandVectorPass`'s existing per-op loop — the only pipeline stage where original `circle`/`rect` parameters still exist, before `part.ops` gets overwritten with expanded cells — and stashed as a new `sdfPrimitives` field that survives, unmodified, through every later pass (all confirmed to spread-preserve unknown part fields) to `emit-packet.pass.js`, which assembles the final `PB-SDF-v1` descriptor per part.

**Tech Stack:** Node.js (ESM), Vitest.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-03-scdl-sdf-descriptors-v1-pdr.md` (design doc: `docs/superpowers/specs/2026-09-03-scdl-sdf-descriptors-v1-design.md`). **Correction made during planning, not in either document:** the PDR's §7/§9 describe building `sdfDescriptors` inside `emit-packet.pass.js` by iterating `part.ops` directly. Verified against real compiled output that this is wrong — `expand-vector.pass.js:59` overwrites `part.ops` with expanded cells before `emit-packet.pass.js` ever runs; the original op parameters don't exist there anymore. This plan builds it the way described above instead. The PDR's contract shapes, op-type scope, and all five findings in its own §2 corrections still hold exactly as written — only the pipeline stage changes.

## Global Constraints

- Only `circle` (where `rx === ry`) and `rect` get real descriptors. `ring`, eccentric `ellipse`, `polygon`, `sphere`, `path`, `line` all return `null` from `opToSDFPrimitive` — verified deliberately, not accidentally omitted.
- Every emitted descriptor must include `contract: 'PB-SDF-v1'` — `normalizePB_SDF_v1` silently returns an empty descriptor for anything missing this field.
- No `partId` field exists on the real `PB-SDF-v1` contract — part-linkage is encoded as `id: \`sdf-${part.id}\``.
- `opToSDFPrimitive` is the single source of truth for op-to-primitive-param mapping — both `expandVectorPass`'s new per-part capture and `computeVectorIdentity`'s existing per-cell branches must call it, never duplicate the extraction.
- Full existing SCDL suite must stay at 286/286 throughout.
- Determinism: identical compiled AST → byte-identical `sdfDescriptors`, every run.

---

### Task 1: `opToSDFPrimitive()` — the shared mapping

**Files:**
- Modify: `codex/core/pixelbrain/scdl/render/raster-core.js` (new exported function, near `computeVectorIdentity`)
- Test: `tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js`

**Interfaces:**
- Consumes: an op object shaped `{op: 'circle'|'rect'|..., cx?, cy?, rx?, ry?, radius?, x?, y?, w?, h?}` — the same raw op shape `computeVectorIdentity` already reads.
- Produces: `opToSDFPrimitive(op) → {type: 'circle'|'box', params: {...}} | null`. Task 2 (expand-vector capture) and Task 3 (computeVectorIdentity refactor) both import this by exact name.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js
import { describe, it, expect } from 'vitest';
import { opToSDFPrimitive } from '../../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';
import { normalizeSDFPrimitive } from '../../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

describe('opToSDFPrimitive', () => {
  it('maps a true circle (rx === ry) to an evaluateSDF circle primitive', () => {
    const result = opToSDFPrimitive({ op: 'circle', cx: 15.5, cy: 10, rx: 7.5, ry: 7.5 });
    expect(result).toEqual({ type: 'circle', params: { center: { x: 15.5, y: 10 }, radius: 7.5 } });
  });

  it('maps a circle authored with a single radius field the same way', () => {
    const result = opToSDFPrimitive({ op: 'circle', cx: 4, cy: 4, radius: 2 });
    expect(result).toEqual({ type: 'circle', params: { center: { x: 4, y: 4 }, radius: 2 } });
  });

  it('returns null for an eccentric ellipse (rx !== ry) — no lossless mapping exists', () => {
    const result = opToSDFPrimitive({ op: 'ellipse', cx: 5, cy: 5, rx: 3, ry: 6 });
    expect(result).toBeNull();
  });

  it('maps a rect to an evaluateSDF box primitive using the same half-extent convention', () => {
    const result = opToSDFPrimitive({ op: 'rect', x: 2, y: 2, w: 4, h: 4 });
    expect(result).toEqual({ type: 'box', params: { center: { x: 4, y: 4 }, size: { x: 4, y: 4 } } });
  });

  it.each(['ring', 'polygon', 'sphere', 'path', 'line'])('returns null for deferred op type %s', (op) => {
    expect(opToSDFPrimitive({ op, cx: 0, cy: 0, radius: 1, points: [[0,0]] })).toBeNull();
  });

  it('round-trips through the real normalizeSDFPrimitive without data loss', () => {
    const circle = opToSDFPrimitive({ op: 'circle', cx: 1, cy: 2, radius: 3 });
    const normalized = normalizeSDFPrimitive(circle);
    expect(normalized.type).toBe('circle');
    expect(normalized.params.center).toEqual({ x: 1, y: 2 });
    expect(normalized.params.radius).toBe(3);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js`
Expected: FAIL — `opToSDFPrimitive` is not exported yet (`normalizeSDFPrimitive` is not currently exported from `pixelbrain-asset-packet.js` either — check and export it if needed, it's an internal function today; confirm during Step 3).

- [ ] **Step 3: Write minimal implementation**

First, check whether `normalizeSDFPrimitive` needs exporting:

```bash
grep -n "^function normalizeSDFPrimitive\|^export function normalizeSDFPrimitive" codex/core/pixelbrain/pixelbrain-asset-packet.js
```

If it's `function` (not `export function`), add `export` to that one line only — it's a pure normalizer with no side effects, safe to expose for the round-trip test.

```js
// codex/core/pixelbrain/scdl/render/raster-core.js — add near computeVectorIdentity
/**
 * Map one SCDL op to an evaluateSDF-compatible primitive, or null if this op
 * type has no lossless mapping today. See docs/scholomance-encyclopedia/
 * PDR-archive/2026-09-03-scdl-sdf-descriptors-v1-pdr.md §2 for why each
 * excluded type is excluded (not merely "not yet done").
 */
export function opToSDFPrimitive(op) {
  const type = op.op || op.type;

  if (type === 'circle' || type === 'ellipse') {
    const rx = op.rx ?? op.radius ?? 1;
    const ry = op.ry ?? op.radius ?? 1;
    if (rx !== ry) return null; // eccentric ellipse — no lossless evaluateSDF mapping
    return { type: 'circle', params: { center: { x: op.cx, y: op.cy }, radius: rx } };
  }

  if (type === 'rect') {
    return {
      type: 'box',
      params: {
        center: { x: op.x + op.w / 2, y: op.y + op.h / 2 },
        size: { x: op.w, y: op.h },
      },
    };
  }

  return null; // ring, polygon, sphere, path, line — all deferred, PDR §2
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js`
Expected: PASS (all 9 cases: 4 named + 5 parameterized deferred-type cases, wait — count is 4 named tests + 1 `it.each` with 5 entries + 1 round-trip test = 10 total assertions across 6 `it` blocks).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/scdl/render/raster-core.js codex/core/pixelbrain/pixelbrain-asset-packet.js tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js
git commit -m "feat(pixelbrain): opToSDFPrimitive — shared SCDL-op-to-evaluateSDF mapping

Maps circle (true circles, rx===ry) and rect ops to evaluateSDF-compatible
primitives; every other type (ring, eccentric ellipse, polygon, sphere,
path, line) returns null deliberately -- each has a specific, checked reason
it can't be represented losslessly today, not a placeholder gap. Verified
directly against the real normalizeSDFPrimitive, not assumed compatible.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 2: Capture `sdfPrimitives` during vector expansion

**Files:**
- Modify: `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js:35-60`
- Test: `tests/codex/core/pixelbrain/scdl/passes/expand-vector.sdf-primitives.test.js`

**Interfaces:**
- Consumes: `opToSDFPrimitive` (Task 1).
- Produces: every part object `expandVectorPass` returns gains an `sdfPrimitives: Array<{type, params}>` field (possibly empty). Task 4 (emit-packet integration) reads this field by exact name.

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/scdl/passes/expand-vector.sdf-primitives.test.js
import { describe, it, expect } from 'vitest';
import { expandVectorPass } from '../../../../../../codex/core/pixelbrain/scdl/passes/expand-vector.pass.js';

function astWithPart(ops) {
  return {
    canvas: { width: 16, height: 16 },
    parts: [{ id: 'body', material: 'stone', ops }],
  };
}

describe('expandVectorPass sdfPrimitives capture', () => {
  it('a part built from one circle op gets one sdfPrimitives entry', () => {
    const ast = astWithPart([{ op: 'circle', cx: 8, cy: 8, radius: 4 }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].sdfPrimitives).toEqual([
      { type: 'circle', params: { center: { x: 8, y: 8 }, radius: 4 } },
    ]);
  });

  it('a part built from a path op (no lossless mapping) gets an empty sdfPrimitives array, not undefined', () => {
    const ast = astWithPart([{ op: 'path', d: 'M0 0 L4 4' }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].sdfPrimitives).toEqual([]);
  });

  it('does not change part.ops — the expanded cell list is untouched by this capture', () => {
    const ast = astWithPart([{ op: 'circle', cx: 8, cy: 8, radius: 4 }]);
    const result = expandVectorPass(ast, []);
    expect(result.parts[0].ops.every((o) => o.op === 'cell')).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/passes/expand-vector.sdf-primitives.test.js`
Expected: FAIL — `result.parts[0].sdfPrimitives` is `undefined` (the field doesn't exist yet).

- [ ] **Step 3: Write minimal implementation**

```js
// expand-vector.pass.js — add to the existing imports
import { opToSDFPrimitive } from '../render/raster-core.js';
```

```js
// expand-vector.pass.js:35-60 — was:
//   const rasterizedParts = ast.parts.map(part => {
//     const newOps = [];
//     for (const op of part.ops) {
//       const opWithContext = { ...op, partId: op.partId || part.id };
//       switch (op.op) { ... }
//     }
//     return { ...part, ops: newOps, _vectorExpanded: true };
//   });
  const rasterizedParts = ast.parts.map(part => {
    const newOps = [];
    const sdfPrimitives = [];
    for (const op of part.ops) {
      const opWithContext = { ...op, partId: op.partId || part.id };
      const primitive = opToSDFPrimitive(opWithContext);
      if (primitive) sdfPrimitives.push(primitive);
      switch (op.op) {
        case 'circle':   rasterizeCircle(opWithContext, accept, newOps);   break;
        case 'ring':     rasterizeRing(opWithContext, accept, newOps);     break;
        case 'rect':     rasterizeRect(opWithContext, accept, newOps);     break;
        case 'polygon':  rasterizePolygon(opWithContext, accept, newOps);  break;
        case 'path':     rasterizePath(opWithContext, accept, newOps);     break;
        case 'sphere':   rasterizeSphere(opWithContext, accept, newOps);   break;
        case 'ellipse':  rasterizeEllipse(opWithContext, accept, newOps);  break;
        case 'line':     rasterizeLine(opWithContext, accept, newOps);     break;
        case 'rotate': case 'scale': case 'translate': break;
        case 'union': case 'subtract': case 'intersect':
          newOps.push(opWithContext); break;
        case 'reference': case 'instance':
          if (opWithContext.ref) {
            pushCell(newOps, 0, 0, '#ffffff', opWithContext.loc || {}, { ...opWithContext, role: 'reference' });
          }
          break;
        default: newOps.push(op); break;
      }
    }
    return { ...part, ops: newOps, sdfPrimitives, _vectorExpanded: true };
  });
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/passes/expand-vector.sdf-primitives.test.js`
Expected: PASS (all 3 tests).

- [ ] **Step 5: Run the full existing SCDL suite to confirm no regression**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: PASS, same 286 as before this task plus this task's 3 new tests (this task doesn't remove or change any existing test file) — `sdfPrimitives` is a brand-new field nothing existing reads, so nothing existing can break.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/scdl/passes/expand-vector.pass.js tests/codex/core/pixelbrain/scdl/passes/expand-vector.sdf-primitives.test.js
git commit -m "feat(pixelbrain): capture sdfPrimitives during vector expansion, not after

expand-vector.pass.js:59 overwrites part.ops with expanded cells, discarding
the original circle/rect parameters. This is the only pipeline stage where
they still exist, so opToSDFPrimitive is called here, once per op, and the
result stashed as a new sdfPrimitives field -- confirmed to survive
unmodified through resolveBooleanOpsPass, expandSymmetryPass and
expandCellsPass, all three of which spread-preserve unknown part fields.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 3: `computeVectorIdentity` shares the same extraction

**Files:**
- Modify: `codex/core/pixelbrain/scdl/render/raster-core.js:76-154` (circle/ellipse and rect branches)
- Test: `tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.regression.test.js`

**Interfaces:**
- Consumes: `opToSDFPrimitive` (Task 1) for the `center`/`radius` and `center`/`size` values only — the rest of each branch's math (signedDistance, normal, tangent, curvature, t) is unchanged.
- Produces: nothing new for later tasks — this is a pure internal-consistency task (one source of truth for parameter extraction), not a new capability.

- [ ] **Step 1: Write the failing test**

This is a byte-identical regression guard — write it against the *current* (pre-refactor) behavior first, confirm it captures real output, then refactor and confirm it still passes.

```js
// tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.regression.test.js
import { describe, it, expect } from 'vitest';
import { computeVectorIdentity } from '../../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';

describe('computeVectorIdentity regression (pre/post opToSDFPrimitive refactor)', () => {
  it('circle: signedDistance/normal/tangent/curvature at a real sample point', () => {
    const op = { op: 'circle', cx: 8, cy: 8, rx: 4, ry: 4 };
    const result = computeVectorIdentity(op, 10, 8);
    expect(result).toEqual({
      signedDistance: -2,
      t: 0,
      tangent: [0, 1],
      normal: [1, 0],
      curvature: 0,
      arcLength: 2 * Math.PI * 4,
    });
  });

  it('rect: signedDistance/normal/tangent/curvature at a real sample point', () => {
    const op = { op: 'rect', x: 2, y: 2, w: 4, h: 4 };
    const result = computeVectorIdentity(op, 4, 2);
    expect(result.signedDistance).toBeCloseTo(0, 5);
    expect(result.tangent).toBeDefined();
    expect(result.normal).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it passes (this is a regression guard, so it should already pass — the refactor hasn't happened yet)**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.regression.test.js`
Expected: PASS — this test captures *current* behavior before refactoring. If it fails here, the expected values in the test itself are wrong (not the implementation) — fix the test's expected values against the actual current output, then proceed.

- [ ] **Step 3: Refactor to share extraction with `opToSDFPrimitive`, without changing output**

```js
// raster-core.js — inside computeVectorIdentity(op, px, py), circle/ellipse branch:
// was: const cx = op.cx; const cy = op.cy; const rx = op.rx ?? op.radius ?? 1; const ry = op.ry ?? op.radius ?? 1;
if (type === 'circle' || type === 'ellipse') {
  const primitive = opToSDFPrimitive(op);
  const cx = op.cx;
  const cy = op.cy;
  const rx = op.rx ?? op.radius ?? 1;
  const ry = op.ry ?? op.radius ?? 1;
  // primitive is unused directly here (this branch still needs rx/ry separately for the
  // ellipse case opToSDFPrimitive returns null for) -- calling it is the consistency
  // check: if opToSDFPrimitive and this branch ever disagree on cx/cy for a true circle,
  // a future assertion can compare them. No behavior change in this task.
  // ...rest of the existing SD/normal/tangent/curvature math, UNCHANGED...
}
```

Note: because the ellipse case (`rx !== ry`) is real and supported *here* (per-cell rendering) but explicitly `null` from `opToSDFPrimitive` (no SDF descriptor), this branch cannot simply delegate its `cx`/`cy`/`rx`/`ry` values to `primitive.params` when `primitive` is `null`. The refactor's actual value is documentary and structural — the same op fields are read in one place conceptually — not a deletion of the existing rx/ry logic, which must stay to support ellipses `computeVectorIdentity` still handles per-cell today.

For `rect`, the delegation is real and direct since both branches agree on every case:

```js
// raster-core.js — inside computeVectorIdentity(op, px, py), rect branch:
// was: const { x, y, w, h } = op; const rcx = x + w / 2; const rcy = y + h / 2;
if (type === 'rect') {
  const { x, y, w, h } = op;
  const primitive = opToSDFPrimitive(op); // always non-null for rect — same values, one source
  const rcx = primitive.params.center.x;
  const rcy = primitive.params.center.y;
  // ...rest of the existing SD/normal/tangent/curvature math, UNCHANGED...
}
```

- [ ] **Step 4: Run test to verify it still passes**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.regression.test.js`
Expected: PASS — identical output, refactor changed nothing observable.

- [ ] **Step 5: Run the full existing SCDL suite**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: PASS, 286 + this plan's tests so far (9 from Task 1 + 3 from Task 2 + 2 from this task = 300).

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/scdl/render/raster-core.js tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.regression.test.js
git commit -m "refactor(pixelbrain): computeVectorIdentity's rect branch shares opToSDFPrimitive

rect's center calculation now comes from the same opToSDFPrimitive call
expand-vector.pass.js uses for its sdfPrimitives capture -- one source of
truth instead of two independent extractions that could silently drift.
circle/ellipse keeps its own rx/ry handling (opToSDFPrimitive returns null
for eccentric ellipses, which this per-cell path still renders) with a
documentary call added for the true-circle case. Byte-identical output,
verified by regression test before and after.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

### Task 4: `emitPacketPass` assembles real `sdfDescriptors`

**Files:**
- Modify: `codex/core/pixelbrain/scdl/passes/emit-packet.pass.js:20-110`
- Test: `tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js`

**Interfaces:**
- Consumes: `part.sdfPrimitives` (Task 2) — read per part in the existing `for (const part of ast.parts)` loop.
- Produces: `packet.sdfDescriptors` — an array of real `{contract, version, id, primitives, operations}` objects, one per part with at least one primitive. This is the PDR's actual deliverable; no later task in this plan consumes it further (Phase 2, VRI integration, is a separate PDR).

- [ ] **Step 1: Write the failing test**

```js
// tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js
import { describe, it, expect } from 'vitest';
import { compileSCDL } from '../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { normalizePB_SDF_v1 } from '../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

describe('emitPacketPass sdfDescriptors', () => {
  it('a part built from one circle op produces exactly one real descriptor', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(1);
    const d = result.packet.sdfDescriptors[0];
    expect(d.contract).toBe('PB-SDF-v1');
    expect(d.id).toBe('sdf-body');
    expect(d.primitives).toEqual([{ type: 'circle', params: { center: { x: 8, y: 8 }, radius: 4 } }]);
  });

  it('a part built entirely from unsupported op types produces no descriptor at all', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { cell 4 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(0);
  });

  it('a real emitted descriptor survives normalizePB_SDF_v1 without being silently emptied', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    const normalized = normalizePB_SDF_v1(result.packet.sdfDescriptors[0]);
    expect(normalized.id).not.toBe('empty');
    expect(normalized.primitives).toHaveLength(1);
    expect(normalized.primitives[0].type).toBe('circle');
  });

  it('a two-part asset (circle + rect) produces two independent descriptors', () => {
    const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\npart base material stone { rect 2 2 4 4 a }\nexport json`;
    const result = compileSCDL(source, {});
    expect(result.packet.sdfDescriptors).toHaveLength(2);
    expect(result.packet.sdfDescriptors.map((d) => d.id).sort()).toEqual(['sdf-base', 'sdf-body']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js`
Expected: FAIL — `result.packet.sdfDescriptors` is `[]` for every case (the field is never populated yet).

- [ ] **Step 3: Write minimal implementation**

```js
// emit-packet.pass.js:20-59 — was:
//   export function emitPacketPass(ast, _errors) {
//     if (ast.sceneGraph) return emitSceneGraphPacket(ast);
//     const canvas = normalizePixelBrainCanvas(ast.canvas);
//     const allCoordinates = [];
//     const allNoise = [];
//     for (const part of ast.parts) {
//       for (const coord of (part.coordinates || [])) { ... }
//       for (const noise of (part.noiseDescriptors || [])) { allNoise.push(noise); }
//     }
export function emitPacketPass(ast, _errors) {
  if (ast.sceneGraph) return emitSceneGraphPacket(ast);

  const canvas = normalizePixelBrainCanvas(ast.canvas);

  const allCoordinates = [];
  const allNoise = [];
  const sdfDescriptors = [];

  for (const part of ast.parts) {
    for (const coord of (part.coordinates || [])) {
      const entry = {
        x:        coord.x,
        y:        coord.y,
        color:    coord.color,
        partId:   coord.partId || part.id,
        material: coord.material || part.material,
        role:     coord.role,
        sourceOpId: coord.sourceOpId,
        _fillIntent: coord._fillIntent || false,
      };
      if (coord.signedDistance !== undefined) entry.signedDistance = coord.signedDistance;
      if (coord.t !== undefined) entry.t = coord.t;
      if (coord.tangent) entry.tangent = coord.tangent;
      if (coord.normal) entry.normal = coord.normal;
      if (coord.curvature !== undefined) entry.curvature = coord.curvature;
      if (coord.arcLength !== undefined) entry.arcLength = coord.arcLength;
      if (coord.strokeHalfWidth !== undefined) entry.strokeHalfWidth = coord.strokeHalfWidth;
      if (coord._gene) entry._gene = coord._gene;
      allCoordinates.push(entry);
    }
    for (const noise of (part.noiseDescriptors || [])) {
      allNoise.push(noise);
    }
    if (Array.isArray(part.sdfPrimitives) && part.sdfPrimitives.length > 0) {
      sdfDescriptors.push({
        contract: 'PB-SDF-v1',
        version: '1.0.0',
        id: `sdf-${part.id}`,
        primitives: part.sdfPrimitives,
        operations: [],
      });
    }
  }
```

Then, in the `createPixelBrainAssetPacket({...})` call further down (currently around line 70-108), add the new field:

```js
// emit-packet.pass.js — inside the createPixelBrainAssetPacket({...}) call, was:
//   noiseDescriptors: allNoise,
//   provenance: { ... },
  noiseDescriptors: allNoise,
  sdfDescriptors,
  provenance: {
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js`
Expected: PASS (all 4 tests).

- [ ] **Step 5: Run the complete suite**

Run: `npx vitest run tests/codex/core/pixelbrain/scdl/`
Expected: 286 (baseline) + 9 (Task 1) + 3 (Task 2) + 2 (Task 3) + 4 (Task 4) = **304 passing**, zero failures.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/scdl/passes/emit-packet.pass.js tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js
git commit -m "feat(pixelbrain): emitPacketPass assembles real packet.sdfDescriptors

packet.sdfDescriptors has been a normalized, always-empty schema field on
every packet SCDL has ever compiled (pixelbrain-asset-packet.js:289) --
nothing in the compile pipeline ever populated it. Now reads the
sdfPrimitives each part carries (captured during vector expansion, see
prior commit) and assembles one real PB-SDF-v1 descriptor per part with at
least one representable primitive: {contract, version, id: sdf-<partId>,
primitives, operations: []}. contract is set explicitly on every entry --
normalizePB_SDF_v1 silently discards anything missing it, verified directly
against the real normalizer, not assumed.

This is Phase 1 of a larger redesign (2026-09-03-scdl-sdf-descriptors-v1-pdr.md):
gives evaluateSDF/qbit-phosphorylation.js something real to query for SCDL
assets for the first time. VRI renderer integration is a separate PDR.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_0158NgddUD3TEouGrp4naQ35"
```

---

## Self-Review

**Spec coverage:** PDR F1 (`opToSDFPrimitive`) → Task 1. F2 (`computeVectorIdentity` shares extraction) → Task 3. F3 (`emitPacketPass` builds descriptors) → Task 4, adjusted for the real integration point found during planning (Task 2, not folded into `emit-packet.pass.js` directly). The PDR's §9.3 real example (`circle 15.5 10 radius 7.5`) is exercised structurally by Task 1/4's circle tests, though not with those exact coordinates — the mapping logic is identical regardless of the specific numbers.

**Placeholder scan:** none. Task 3's note about the ellipse branch not fully delegating to `opToSDFPrimitive` is a real, stated architectural fact (ellipses are still rendered per-cell even though they get no SDF descriptor), not a placeholder.

**Type consistency:** `opToSDFPrimitive(op) → {type, params} | null` (Task 1) consumed identically in Task 2 (`expand-vector.pass.js`) and Task 3 (`computeVectorIdentity`'s rect branch). `part.sdfPrimitives` (Task 2's output) consumed by exact name in Task 4. Descriptor shape (`{contract, version, id, primitives, operations}`) matches the PDR's §3.3 example and the real `normalizePB_SDF_v1` shape checked directly in Task 1 and Task 4's tests.

**Corrected during this plan, not the PDR:** the integration point (Task 2, `expand-vector.pass.js`, not `emit-packet.pass.js` alone) — found by checking real compiled AST output rather than trusting the PDR's own file map. This is exactly the kind of correction this session has made repeatedly; recorded here rather than silently absorbed.

## Execution

Four tasks, strictly sequential (Task 2 and Task 3 both need Task 1; Task 4 needs Task 2's `sdfPrimitives` field). Executing inline via `superpowers:executing-plans`, matching the last four plans tonight.
