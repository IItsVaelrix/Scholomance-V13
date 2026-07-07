# Photonic Retina Agent Eye Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the procedural/ML pipeline a deterministic "eye" that emits a per-cell `attendMask` so it processes only changed-or-unsettled lattice cells instead of re-scanning the whole canvas, while re-waking committed cells whose shadows shifted.

**Architecture:** Approach B — lattice-side memory, Retina core stays pure. Three new pure modules (cell-grid model + change diff, placement-commit memory, shadow/light channel) feed a pure assembler that composes one `PerceptionFrame`. All per-cell masks index lattice cells in canonical row-major order (`index = row*cols + col`), never Retina packet vector slots.

**Tech Stack:** Plain ES modules (no new deps), Vitest for tests. New files in `src/lib/photonic-retina/` and `codex/core/pixelbrain/`.

## Global Constraints

- Determinism: no `Date.now`, no `Math.random` anywhere in these modules; `generation` is always a caller-supplied integer. (Retina PDR §11.)
- Cell Wall: `src/lib/photonic-retina/` files must NOT import from `codex/`. Channels receive lattice/shadow data as plain arrays passed in by the caller.
- Cell Indexing Invariant: every mask is length `cellCount = rows*cols`, indexed `row*cols + col`. Never index a mask by a Retina packet slot.
- Fail-safe = attend: missing/malformed per-cell evidence or shadow data makes that cell `attend = 1`, never silently skipped. Skipping is only earned by a positive placement commit.
- Test runner: `npx vitest run <path>`. Test files mirror source path under `tests/`.
- Spec: `docs/superpowers/specs/2026-06-26-photonic-retina-agent-eye-design.md`.

---

### Task 1: Canonical cell index helpers

**Files:**
- Create: `src/lib/photonic-retina/retina-cell-index.js`
- Test: `tests/photonic-retina/retina-cell-index.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `cellIndex(row, col, cols) => number` — row-major index `row*cols + col`.
  - `cellCount(rows, cols) => number` — `rows*cols`.

- [ ] **Step 1: Write the failing test**

```js
// tests/photonic-retina/retina-cell-index.test.js
import { describe, expect, it } from 'vitest';
import { cellIndex, cellCount } from '../../src/lib/photonic-retina/retina-cell-index.js';

describe('retina-cell-index', () => {
  it('maps row/col to row-major order', () => {
    expect(cellIndex(0, 0, 4)).toBe(0);
    expect(cellIndex(0, 3, 4)).toBe(3);
    expect(cellIndex(1, 0, 4)).toBe(4);
    expect(cellIndex(2, 1, 4)).toBe(9);
  });

  it('computes cell count', () => {
    expect(cellCount(3, 4)).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/photonic-retina/retina-cell-index.test.js`
Expected: FAIL — `cellIndex is not a function` / cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/photonic-retina/retina-cell-index.js

/** Canonical row-major cell index. ALL perception masks use this ordering. */
export function cellIndex(row, col, cols) {
  return (row * cols) + col;
}

/** Total cells in a rows x cols lattice. */
export function cellCount(rows, cols) {
  return rows * cols;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/photonic-retina/retina-cell-index.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/photonic-retina/retina-cell-index.js tests/photonic-retina/retina-cell-index.test.js
git commit -m "feat(retina): canonical row-major cell index helpers"
```

---

### Task 2: Cell signatures and change diff (changedMask)

**Files:**
- Modify: `src/lib/photonic-retina/retina-cell-index.js`
- Test: `tests/photonic-retina/retina-cell-snapshot.test.js`

**Interfaces:**
- Consumes: `cellCount` from Task 1.
- Produces:
  - `cellSignature(cell) => number` — deterministic scalar for one cell. `cell` is `{ color?: string, emphasis?: number, occupied?: boolean }` or `null`/`undefined`. Empty/unoccupied → `0`.
  - `buildCellSignatures(denseCells) => Float64Array` — `denseCells` is a row-major array (length = cellCount) of cell descriptors or `null`. Returns one signature per cell.
  - `diffCellSignatures(prev, curr) => Uint8Array` — `changedMask`; `1` where signatures differ. `prev` may be `null` (first tick → all `1`). Length follows `curr`.

- [ ] **Step 1: Write the failing test**

```js
// tests/photonic-retina/retina-cell-snapshot.test.js
import { describe, expect, it } from 'vitest';
import {
  cellSignature,
  buildCellSignatures,
  diffCellSignatures,
} from '../../src/lib/photonic-retina/retina-cell-index.js';

describe('cell signatures', () => {
  it('returns 0 for empty or unoccupied cells', () => {
    expect(cellSignature(null)).toBe(0);
    expect(cellSignature({ occupied: false, color: '#ffffff' })).toBe(0);
  });

  it('is deterministic and distinguishes color and emphasis', () => {
    const a = cellSignature({ color: '#112233', emphasis: 1, occupied: true });
    const b = cellSignature({ color: '#112233', emphasis: 1, occupied: true });
    const c = cellSignature({ color: '#112233', emphasis: 0.5, occupied: true });
    const d = cellSignature({ color: '#445566', emphasis: 1, occupied: true });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).not.toBe(d);
  });

  it('builds a dense signature array', () => {
    const sigs = buildCellSignatures([{ color: '#112233', emphasis: 1, occupied: true }, null]);
    expect(sigs).toBeInstanceOf(Float64Array);
    expect(sigs.length).toBe(2);
    expect(sigs[1]).toBe(0);
  });
});

describe('diffCellSignatures', () => {
  it('flags only cells whose signature changed', () => {
    const prev = buildCellSignatures([
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
    ]);
    const curr = buildCellSignatures([
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true },
    ]);
    expect(Array.from(diffCellSignatures(prev, curr))).toEqual([0, 1]);
  });

  it('treats a null prev as a full-change first tick', () => {
    const curr = buildCellSignatures([null, { color: '#112233', emphasis: 1, occupied: true }]);
    expect(Array.from(diffCellSignatures(null, curr))).toEqual([1, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/photonic-retina/retina-cell-snapshot.test.js`
Expected: FAIL — `cellSignature is not a function`.

- [ ] **Step 3: Write minimal implementation (append to `retina-cell-index.js`)**

```js
function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function colorToInt(color) {
  const raw = String(color || '').trim().replace('#', '');
  const hex = raw.length === 3 ? raw.split('').map((c) => c + c).join('') : raw;
  if (!/^[0-9a-fA-F]{6}$/.test(hex)) return 0;
  return parseInt(hex, 16); // 0 .. 16777215
}

/**
 * Deterministic scalar fingerprint of a cell's value.
 * 0 is reserved for empty / unoccupied cells so a freshly cleared cell
 * is distinguishable from a painted one.
 */
export function cellSignature(cell) {
  if (!cell || cell.occupied === false) return 0;
  const emphasisByte = Math.round(clamp01(cell.emphasis === undefined ? 1 : cell.emphasis) * 255);
  // colorInt in [0, 2^24); *256 + emphasis + 1 stays well within Number.MAX_SAFE_INTEGER.
  return (colorToInt(cell.color) * 256) + emphasisByte + 1;
}

/** Map a row-major dense array of cell descriptors (or null) to signatures. */
export function buildCellSignatures(denseCells) {
  const list = Array.isArray(denseCells) ? denseCells : [];
  const out = new Float64Array(list.length);
  for (let i = 0; i < list.length; i += 1) out[i] = cellSignature(list[i]);
  return out;
}

/** changedMask: 1 where curr differs from prev. null prev => first-tick full change. */
export function diffCellSignatures(prev, curr) {
  const current = curr || new Float64Array(0);
  const mask = new Uint8Array(current.length);
  if (!prev) { mask.fill(1); return mask; }
  for (let i = 0; i < current.length; i += 1) {
    mask[i] = prev[i] === current[i] ? 0 : 1;
  }
  return mask;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/photonic-retina/retina-cell-snapshot.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/photonic-retina/retina-cell-index.js tests/photonic-retina/retina-cell-snapshot.test.js
git commit -m "feat(retina): cell signatures + change diff (changedMask)"
```

---

### Task 3: Placement-commit memory (committedMask)

**Files:**
- Create: `codex/core/pixelbrain/qbit-placement-memory.js`
- Test: `tests/pixelbrain/qbit-placement-memory.test.js`

**Interfaces:**
- Consumes: nothing (pure; mirrors `qbit-phosphorylation.js` shape).
- Produces:
  - `PLACEMENT_COMMIT_THRESHOLD` — number constant.
  - `evaluatePlacementCommit(evidence, options) => { committed: boolean, confidence: number, generation: number }`. `evidence` is `{ snapStable: boolean, symmetryAgreement: number, energy: number }` or malformed/`null`. `options.generation` is a caller integer (default 0).
  - `buildCommittedMask(evidenceList, options) => Uint8Array` — `evidenceList` is a row-major array; `1` where `committed`.

- [ ] **Step 1: Write the failing test**

```js
// tests/pixelbrain/qbit-placement-memory.test.js
import { describe, expect, it } from 'vitest';
import {
  PLACEMENT_COMMIT_THRESHOLD,
  evaluatePlacementCommit,
  buildCommittedMask,
} from '../../codex/core/pixelbrain/qbit-placement-memory.js';

describe('evaluatePlacementCommit', () => {
  it('commits a stable, symmetric, energetic cell', () => {
    const r = evaluatePlacementCommit(
      { snapStable: true, symmetryAgreement: 1, energy: 1 },
      { generation: 7 },
    );
    expect(r.committed).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(PLACEMENT_COMMIT_THRESHOLD);
    expect(r.generation).toBe(7);
  });

  it('is deterministic for identical evidence', () => {
    const e = { snapStable: true, symmetryAgreement: 0.5, energy: 0.5 };
    expect(evaluatePlacementCommit(e, { generation: 1 }))
      .toEqual(evaluatePlacementCommit(e, { generation: 1 }));
  });

  it('does not commit when placement is unstable (fail-safe => attend)', () => {
    const r = evaluatePlacementCommit({ snapStable: false, symmetryAgreement: 1, energy: 1 });
    expect(r.committed).toBe(false);
    expect(r.confidence).toBe(0);
  });

  it('does not commit on malformed evidence', () => {
    expect(evaluatePlacementCommit(null).committed).toBe(false);
    expect(evaluatePlacementCommit({}).committed).toBe(false);
  });
});

describe('buildCommittedMask', () => {
  it('marks committed cells in row-major order', () => {
    const mask = buildCommittedMask([
      { snapStable: true, symmetryAgreement: 1, energy: 1 },
      { snapStable: false, symmetryAgreement: 1, energy: 1 },
      null,
    ]);
    expect(Array.from(mask)).toEqual([1, 0, 0]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pixelbrain/qbit-placement-memory.test.js`
Expected: FAIL — cannot find module / not a function.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/qbit-placement-memory.js
//
// Coordinate-placement memory. The geometry analogue of qbit-phosphorylation's
// COLOR commit: a cell deterministically "remembers" that its placement is
// settled, so downstream perception may ignore it. Deterministic (Retina PDR
// determinism contract): no Date.now, no Math.random; generation is supplied.

export const PLACEMENT_COMMIT_THRESHOLD = 0.6;

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

/**
 * Confidence that a cell's coordinate placement is settled.
 * snapStable is the gate (an unstable snap can never commit); symmetry
 * agreement and energy raise confidence within the stable band.
 */
export function evaluatePlacementCommit(evidence, options = {}) {
  const generation = Number.isInteger(options.generation) ? options.generation : 0;

  if (!evidence || typeof evidence !== 'object' || evidence.snapStable !== true) {
    return { committed: false, confidence: 0, generation };
  }

  const symmetry = clamp01(evidence.symmetryAgreement);
  const energy = clamp01(evidence.energy);
  const confidence = 0.5 + (0.3 * symmetry) + (0.2 * energy);

  return {
    committed: confidence >= PLACEMENT_COMMIT_THRESHOLD,
    confidence,
    generation,
  };
}

/** Row-major committed bitmask over a dense evidence array. */
export function buildCommittedMask(evidenceList, options = {}) {
  const list = Array.isArray(evidenceList) ? evidenceList : [];
  const mask = new Uint8Array(list.length);
  for (let i = 0; i < list.length; i += 1) {
    mask[i] = evaluatePlacementCommit(list[i], options).committed ? 1 : 0;
  }
  return mask;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pixelbrain/qbit-placement-memory.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/qbit-placement-memory.js tests/pixelbrain/qbit-placement-memory.test.js
git commit -m "feat(pixelbrain): placement-commit memory (committedMask)"
```

---

### Task 4: Shadow/light channel (shadowMask)

**Files:**
- Create: `src/lib/photonic-retina/retina-shadow-field.js`
- Test: `tests/photonic-retina/retina-shadow-field.test.js`

**Interfaces:**
- Consumes: nothing (pure; shadow data passed in by interface — no codex import).
- Produces:
  - `SHADOW_DELTA_EPSILON` — number constant.
  - `diffShadowField(prevField, currField, options) => Uint8Array` — `shadowMask`; `1` where a cell's lighting changed. `prevField`/`currField` are row-major arrays of per-cell shadow scalars. `null` `prevField` => first tick (all `1`). Missing/non-finite `currField[i]` => `1` (fail-safe). `options.epsilon` overrides the default.

- [ ] **Step 1: Write the failing test**

```js
// tests/photonic-retina/retina-shadow-field.test.js
import { describe, expect, it } from 'vitest';
import {
  SHADOW_DELTA_EPSILON,
  diffShadowField,
} from '../../src/lib/photonic-retina/retina-shadow-field.js';

describe('diffShadowField', () => {
  it('flags cells whose lighting changed beyond epsilon', () => {
    const prev = [0.10, 0.50, 0.90];
    const curr = [0.10, 0.80, 0.90];
    expect(Array.from(diffShadowField(prev, curr))).toEqual([0, 1, 0]);
  });

  it('ignores sub-epsilon jitter', () => {
    const prev = [0.5];
    const curr = [0.5 + (SHADOW_DELTA_EPSILON / 2)];
    expect(Array.from(diffShadowField(prev, curr))).toEqual([0]);
  });

  it('treats null prev as first-tick full change', () => {
    expect(Array.from(diffShadowField(null, [0.1, 0.2]))).toEqual([1, 1]);
  });

  it('attends cells with missing/non-finite current values (fail-safe)', () => {
    expect(Array.from(diffShadowField([0.1, 0.2], [0.1, undefined]))).toEqual([0, 1]);
    expect(Array.from(diffShadowField([0.1, 0.2], [0.1, NaN]))).toEqual([0, 1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/photonic-retina/retina-shadow-field.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/photonic-retina/retina-shadow-field.js
//
// The "light" channel of the photonic retina. Shadow change is NON-LOCAL: a
// cell's lighting can change because a neighbour moved, even though the cell's
// own value did not. No per-cell value delta can detect that; this module does.
// Pure: shadow fields are passed in by the caller (no codex import).

export const SHADOW_DELTA_EPSILON = 1 / 255;

/** shadowMask: 1 where a cell's lighting changed. */
export function diffShadowField(prevField, currField, options = {}) {
  const curr = Array.isArray(currField) || ArrayBuffer.isView(currField) ? currField : [];
  const epsilon = Number.isFinite(options.epsilon) ? options.epsilon : SHADOW_DELTA_EPSILON;
  const mask = new Uint8Array(curr.length);

  if (!prevField) { mask.fill(1); return mask; }

  for (let i = 0; i < curr.length; i += 1) {
    const c = Number(curr[i]);
    const p = Number(prevField[i]);
    if (!Number.isFinite(c) || !Number.isFinite(p)) { mask[i] = 1; continue; } // fail-safe
    mask[i] = Math.abs(c - p) > epsilon ? 1 : 0;
  }
  return mask;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/photonic-retina/retina-shadow-field.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/photonic-retina/retina-shadow-field.js tests/photonic-retina/retina-shadow-field.test.js
git commit -m "feat(retina): non-local shadow/light channel (shadowMask)"
```

---

### Task 5: Perception assembler (PerceptionFrame)

**Files:**
- Create: `src/lib/photonic-retina/retina-perception.js`
- Test: `tests/photonic-retina/retina-perception.test.js`

**Interfaces:**
- Consumes: `cellCount` (Task 1); `stableHash` from `src/lib/photonic-retina/retina-hash.js` (existing — signature `stableHash(value) => string`).
- Produces:
  - `assemblePerceptionFrame({ changedMask, committedMask, shadowMask, rows, cols, generation }) => PerceptionFrame`. Throws if any mask length !== `rows*cols`.
  - `fullAttendFrame(rows, cols, generation) => PerceptionFrame` — every cell attends; used for first tick and degrade-to-today.
  - `PerceptionFrame` shape: `{ cellCount, cols, rows, attendMask: Uint8Array, attendIndices: Uint32Array, committedMask: Uint8Array, shadowMask: Uint8Array, changedMask: Uint8Array, generation, frameHash }`.
  - Composition rule: `attendMask[i] = (changedMask[i] && !committedMask[i]) || shadowMask[i]`.

- [ ] **Step 1: Write the failing test**

```js
// tests/photonic-retina/retina-perception.test.js
import { describe, expect, it } from 'vitest';
import {
  assemblePerceptionFrame,
  fullAttendFrame,
} from '../../src/lib/photonic-retina/retina-perception.js';

function frame(changed, committed, shadow, rows, cols) {
  return assemblePerceptionFrame({
    changedMask: Uint8Array.from(changed),
    committedMask: Uint8Array.from(committed),
    shadowMask: Uint8Array.from(shadow),
    rows,
    cols,
    generation: 3,
  });
}

describe('assemblePerceptionFrame', () => {
  it('attends changed, uncommitted cells', () => {
    const f = frame([1, 0], [0, 0], [0, 0], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([1, 0]);
  });

  it('ignores changed but committed cells (the core win)', () => {
    const f = frame([1, 1], [1, 1], [0, 0], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([0, 0]);
    expect(Array.from(f.attendIndices)).toEqual([]);
  });

  it('re-wakes a committed, unchanged cell whose shadow moved (non-local)', () => {
    const f = frame([0, 0], [1, 1], [0, 1], 1, 2);
    expect(Array.from(f.attendMask)).toEqual([0, 1]);
    expect(Array.from(f.attendIndices)).toEqual([1]);
  });

  it('is deterministic including frameHash', () => {
    const a = frame([1, 0], [0, 1], [0, 1], 1, 2);
    const b = frame([1, 0], [0, 1], [0, 1], 1, 2);
    expect(a.frameHash).toBe(b.frameHash);
  });

  it('throws on mask length mismatch', () => {
    expect(() => assemblePerceptionFrame({
      changedMask: Uint8Array.from([1]),
      committedMask: Uint8Array.from([0, 0]),
      shadowMask: Uint8Array.from([0, 0]),
      rows: 1, cols: 2, generation: 0,
    })).toThrow(/length/i);
  });
});

describe('fullAttendFrame', () => {
  it('attends every cell', () => {
    const f = fullAttendFrame(2, 2, 0);
    expect(f.cellCount).toBe(4);
    expect(Array.from(f.attendMask)).toEqual([1, 1, 1, 1]);
    expect(Array.from(f.attendIndices)).toEqual([0, 1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/photonic-retina/retina-perception.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// src/lib/photonic-retina/retina-perception.js
//
// Pure assembler. Composes the three cell-indexed channels into one
// PerceptionFrame. Depends only on plain mask arrays — never on lattice or
// phosphorylation internals. All masks are row-major (index = row*cols + col).

import { cellCount as countCells } from './retina-cell-index.js';
import { stableHash } from './retina-hash.js';

function indicesOf(mask) {
  const out = [];
  for (let i = 0; i < mask.length; i += 1) if (mask[i]) out.push(i);
  return Uint32Array.from(out);
}

function buildFrame(changedMask, committedMask, shadowMask, rows, cols, generation) {
  const total = countCells(rows, cols);
  const attendMask = new Uint8Array(total);
  for (let i = 0; i < total; i += 1) {
    // attend = (changed AND NOT committed) OR shadow-moved
    attendMask[i] = ((changedMask[i] && !committedMask[i]) || shadowMask[i]) ? 1 : 0;
  }
  const attendIndices = indicesOf(attendMask);
  const frameHash = stableHash({
    generation,
    cols,
    rows,
    attend: Array.from(attendMask),
  });
  return Object.freeze({
    cellCount: total,
    cols,
    rows,
    attendMask,
    attendIndices,
    committedMask,
    shadowMask,
    changedMask,
    generation,
    frameHash,
  });
}

export function assemblePerceptionFrame({ changedMask, committedMask, shadowMask, rows, cols, generation = 0 }) {
  const total = countCells(rows, cols);
  for (const [name, mask] of [['changedMask', changedMask], ['committedMask', committedMask], ['shadowMask', shadowMask]]) {
    if (!mask || mask.length !== total) {
      throw new Error(`PerceptionFrame ${name} length ${mask ? mask.length : 'undefined'} !== cellCount ${total}`);
    }
  }
  return buildFrame(changedMask, committedMask, shadowMask, rows, cols, generation);
}

export function fullAttendFrame(rows, cols, generation = 0) {
  const total = countCells(rows, cols);
  const zero = new Uint8Array(total);
  const ones = new Uint8Array(total).fill(1);
  // changed=1, committed=0, shadow=0 => attend everywhere.
  return buildFrame(ones, zero, zero, rows, cols, generation);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/photonic-retina/retina-perception.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/photonic-retina/retina-perception.js tests/photonic-retina/retina-perception.test.js
git commit -m "feat(retina): perception assembler (PerceptionFrame)"
```

---

### Task 6: Public exports + end-to-end perception tick

**Files:**
- Modify: `src/lib/photonic-retina/index.js`
- Test: `tests/photonic-retina/perception-tick.test.js`

**Interfaces:**
- Consumes: all of Tasks 1–5.
- Produces: re-exports from `index.js` so consumers import the perception API from the package root:
  `cellIndex`, `cellCount`, `cellSignature`, `buildCellSignatures`, `diffCellSignatures`, `diffShadowField`, `assemblePerceptionFrame`, `fullAttendFrame`.
  (`evaluatePlacementCommit` / `buildCommittedMask` stay in codex and are NOT re-exported here — Cell Wall.)

- [ ] **Step 1: Write the failing test**

```js
// tests/photonic-retina/perception-tick.test.js
import { describe, expect, it } from 'vitest';
import {
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
} from '../../src/lib/photonic-retina/index.js';
import { buildCommittedMask } from '../../codex/core/pixelbrain/qbit-placement-memory.js';

const rows = 1;
const cols = 3;
const committedEvidence = [
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
  { snapStable: true, symmetryAgreement: 1, energy: 1 },
];

describe('end-to-end perception tick', () => {
  it('the core win: a settled, unchanged, unlit-change canvas attends nothing', () => {
    const cells = [
      { color: '#112233', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true },
    ];
    const prev = buildCellSignatures(cells);
    const curr = buildCellSignatures(cells);
    const shadowPrev = [0.2, 0.2, 0.2];
    const shadowCurr = [0.2, 0.2, 0.2];

    const frame = assemblePerceptionFrame({
      changedMask: diffCellSignatures(prev, curr),
      committedMask: buildCommittedMask(committedEvidence, { generation: 5 }),
      shadowMask: diffShadowField(shadowPrev, shadowCurr),
      rows, cols, generation: 5,
    });

    expect(Array.from(frame.attendIndices)).toEqual([]);
  });

  it('non-local shadow re-wakes a committed neighbour when an occluder lands', () => {
    // Cell 0 gets newly occupied (the occluder); cells 1,2 unchanged but their
    // shadow shifts because of the new occluder.
    const before = [null,
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true }];
    const after = [{ color: '#000000', emphasis: 1, occupied: true },
      { color: '#445566', emphasis: 1, occupied: true },
      { color: '#778899', emphasis: 1, occupied: true }];
    const prev = buildCellSignatures(before);
    const curr = buildCellSignatures(after);
    const shadowPrev = [0.2, 0.2, 0.2];
    const shadowCurr = [0.2, 0.6, 0.5]; // occluder darkened neighbours

    const frame = assemblePerceptionFrame({
      changedMask: diffCellSignatures(prev, curr),
      committedMask: buildCommittedMask(committedEvidence, { generation: 6 }),
      shadowMask: diffShadowField(shadowPrev, shadowCurr),
      rows, cols, generation: 6,
    });

    // Cell 0: changed + committed => ignored by placement, but its own shadow
    // didn't move. Cells 1,2: committed + unchanged, but shadow moved => attend.
    expect(Array.from(frame.attendIndices)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/photonic-retina/perception-tick.test.js`
Expected: FAIL — `diffShadowField` / `assemblePerceptionFrame` not exported from `index.js`.

- [ ] **Step 3: Add exports to `index.js`**

Append to `src/lib/photonic-retina/index.js`:

```js
export {
  cellIndex,
  cellCount,
  cellSignature,
  buildCellSignatures,
  diffCellSignatures,
} from './retina-cell-index.js';

export {
  SHADOW_DELTA_EPSILON,
  diffShadowField,
} from './retina-shadow-field.js';

export {
  assemblePerceptionFrame,
  fullAttendFrame,
} from './retina-perception.js';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/photonic-retina/perception-tick.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the full retina + placement suites to confirm no regressions**

Run: `npx vitest run tests/photonic-retina tests/pixelbrain/qbit-placement-memory.test.js`
Expected: PASS (all existing retina tests + the 5 new files).

- [ ] **Step 6: Commit**

```bash
git add src/lib/photonic-retina/index.js tests/photonic-retina/perception-tick.test.js
git commit -m "feat(retina): export perception API + end-to-end tick coverage"
```

---

## Deferred (NOT in this plan)

- **Live wiring.** Driving real lattice cells + `shadow-amp` output into this perception layer from the procedural loop is a separate task. The two existing Retina↔PixelBrain entry points are test-only today; the call site that feeds the eye each tick is follow-up work. This plan delivers the pure, tested perception core only.
- **Compressed attention map** (`cellIndexMap` / Option B) — only once the uncompressed path is stable.
- **LLM text digest channel** — out of scope; consumer here is the procedural/ML pipeline.

## Self-Review

- **Spec coverage:** placement memory (Task 3), shadow channel (Task 4), assembler + composition rule (Task 5), PerceptionFrame contract (Task 5/6), Cell Indexing Invariant (Tasks 1–2, masks built from cell signatures not packet slots), fail-safe=attend (Tasks 3,4 + fullAttendFrame), determinism (no Date.now/random; generation supplied; frameHash), the core-win + non-local-shadow regressions (Task 6), degrade-to-today via `fullAttendFrame` (Task 5). Live wiring is explicitly deferred per spec's Wiring note.
- **Placeholder scan:** none — every code/test step is complete.
- **Type consistency:** mask names (`changedMask`/`committedMask`/`shadowMask`/`attendMask`), `PerceptionFrame` fields, and `evidence` shape (`snapStable`/`symmetryAgreement`/`energy`) are identical across Tasks 3–6.
