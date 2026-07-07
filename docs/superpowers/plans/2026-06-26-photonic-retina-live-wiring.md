# Photonic Retina Live Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drive the perception eye (`assemblePerceptionFrame`) from the LIVE lattice path (`generateLatticeGrid`), with a dedicated shadow microprocessor giving the path a real non-local shadow source — emitting a real three-channel PerceptionFrame each generation.

**Architecture:** A new `amp.shadow-perception` microprocessor produces a dense per-cell shadow scalar field on the lattice path (idiomatic to how `amp.symmetry`/`amp.coord-symmetry` already run). A codex-side perception bridge maps `lattice.cells` → dense row-major grid, derives the three channels (change from cell signatures, placement-commit from real symmetry/snap/emphasis evidence, shadow from the new field's diff), and calls the already-built `assemblePerceptionFrame`. Wiring into `generateLatticeGrid` is opt-in (flag-gated) and threads previous-generation state through the caller.

**Tech Stack:** Plain ES modules, Vitest. The perception core (`src/lib/photonic-retina/`) and placement memory (`codex/core/pixelbrain/qbit-placement-memory.js`) already exist and are unchanged.

## Global Constraints

- Determinism: no `Date.now`, no `Math.random`; `generation` is a caller-supplied integer.
- Cell Indexing Invariant: all masks length `cellCount = rows*cols`, row-major `row*cols+col`, where `rows`/`cols` are the lattice grid dimensions (NOT canvas pixels, NOT packet slots).
- Opt-in: `generateLatticeGrid` perception runs ONLY when `options.perception` is enabled. Default path is byte-for-byte unchanged — existing lattice tests must still pass untouched.
- Reuse: use existing `buildCellSignatures`, `diffCellSignatures`, `diffShadowField`, `assemblePerceptionFrame` (from `src/lib/photonic-retina/index.js`) and `buildCommittedMask` (from `codex/core/pixelbrain/qbit-placement-memory.js`). Do NOT reimplement them.
- Test runner: `npx vitest run <path>`.
- Spec lineage: `docs/superpowers/specs/2026-06-26-photonic-retina-agent-eye-design.md` (this is the deferred "live wiring" step).

---

### Task 1: Shadow-perception AMP (dense per-cell shadow field)

**Files:**
- Create: `codex/core/pixelbrain/shadow-perception-amp.js`
- Test: `tests/pixelbrain/shadow-perception-amp.test.js`

**Interfaces:**
- Consumes: nothing (pure; mirrors `shadow-amp.js` darkening rules but emits a scalar field).
- Produces:
  - `SHADOW_PERCEPTION_AMP_ID` — string constant `'pixelbrain.shadow-perception-amp'`.
  - `SHADOW_SCALARS` — frozen `{ NONE: 0, POCKET: 0.15, EDGE: 0.25 }`.
  - `runShadowPerceptionAmp({ coordinates, vectorField, cols, rows }) => { ampId, shadowField }` where `shadowField` is a `Float64Array` length `cols*rows`, row-major, each entry the shadow intensity for that cell (0 if empty/unshadowed). Cell position uses `col`/`row` (fall back to `snappedX`/`x` and `snappedY`/`y` when col/row absent, i.e. pixel coords already equal grid coords for the lattice). A cell is EDGE-shadowed when its `vectorField` entry role is `'edge-flow'`; POCKET-shadowed when its `colorIntensity.role` is `'black_anchor'` or `'cold_chroma'`; otherwise NONE (including protected `'white_core'`/`'hot_chroma'`).

- [ ] **Step 1: Write the failing test**

```js
// tests/pixelbrain/shadow-perception-amp.test.js
import { describe, expect, it } from 'vitest';
import {
  SHADOW_SCALARS,
  runShadowPerceptionAmp,
} from '../../codex/core/pixelbrain/shadow-perception-amp.js';

const cols = 2;
const rows = 2;

describe('runShadowPerceptionAmp', () => {
  it('emits a dense row-major shadow field with edge and pocket scalars', () => {
    const coordinates = [
      { col: 0, row: 0, color: '#445566', colorIntensity: { role: 'black_anchor' } }, // pocket
      { col: 1, row: 0, color: '#ffffff', colorIntensity: { role: 'white_core' } },    // protected
      { col: 0, row: 1, color: '#223344' }, // edge (via vectorField)
    ];
    const vectorField = [{ x: 0, y: 1, role: 'edge-flow' }];
    const { shadowField } = runShadowPerceptionAmp({ coordinates, vectorField, cols, rows });

    expect(shadowField).toBeInstanceOf(Float64Array);
    expect(shadowField.length).toBe(4);
    expect(shadowField[0]).toBe(SHADOW_SCALARS.POCKET); // (0,0)
    expect(shadowField[1]).toBe(SHADOW_SCALARS.NONE);   // (1,0) protected
    expect(shadowField[2]).toBe(SHADOW_SCALARS.EDGE);   // (0,1) edge-flow
    expect(shadowField[3]).toBe(SHADOW_SCALARS.NONE);   // (1,1) empty
  });

  it('is deterministic for identical input', () => {
    const args = { coordinates: [{ col: 0, row: 0, color: '#445566', colorIntensity: { role: 'cold_chroma' } }], vectorField: [], cols, rows };
    expect(Array.from(runShadowPerceptionAmp(args).shadowField))
      .toEqual(Array.from(runShadowPerceptionAmp(args).shadowField));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pixelbrain/shadow-perception-amp.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/shadow-perception-amp.js
//
// Dense per-cell shadow scalar field for the photonic-retina perception eye.
// Reuses shadow-amp's edge/pocket/core classification but emits a row-major
// Float64Array (one scalar per lattice cell) instead of recolored coordinates.
// This is the NON-LOCAL light source: a neighbour's edge-flow change shifts a
// cell's scalar even though the cell's own colour did not change. Deterministic.

export const SHADOW_PERCEPTION_AMP_ID = 'pixelbrain.shadow-perception-amp';

export const SHADOW_SCALARS = Object.freeze({ NONE: 0, POCKET: 0.15, EDGE: 0.25 });

function cellCol(coord) {
  return Number.isFinite(Number(coord?.col)) ? Number(coord.col)
    : Number(coord?.snappedX ?? coord?.x ?? 0);
}

function cellRow(coord) {
  return Number.isFinite(Number(coord?.row)) ? Number(coord.row)
    : Number(coord?.snappedY ?? coord?.y ?? 0);
}

export function runShadowPerceptionAmp({ coordinates = [], vectorField = [], cols = 0, rows = 0 } = {}) {
  const field = new Float64Array(Math.max(0, cols * rows));

  const vectorMap = new Map();
  for (const v of vectorField) vectorMap.set(`${v.x},${v.y}`, v);

  for (const coord of coordinates) {
    const col = cellCol(coord);
    const row = cellRow(coord);
    if (col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const index = (row * cols) + col;

    const role = coord?.colorIntensity?.role || 'neutral';
    if (role === 'white_core' || role === 'hot_chroma') {
      field[index] = SHADOW_SCALARS.NONE;
      continue;
    }

    const vectorData = vectorMap.get(`${col},${row}`);
    if (vectorData && vectorData.role === 'edge-flow') {
      field[index] = SHADOW_SCALARS.EDGE;
    } else if (role === 'black_anchor' || role === 'cold_chroma') {
      field[index] = SHADOW_SCALARS.POCKET;
    } else {
      field[index] = SHADOW_SCALARS.NONE;
    }
  }

  return { ampId: SHADOW_PERCEPTION_AMP_ID, shadowField: field };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pixelbrain/shadow-perception-amp.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/shadow-perception-amp.js tests/pixelbrain/shadow-perception-amp.test.js
git commit -m "feat(pixelbrain): shadow-perception AMP — dense per-cell shadow field"
```

---

### Task 2: Register the `amp.shadow-perception` microprocessor

**Files:**
- Modify: `codex/core/microprocessors/index.js`
- Test: `tests/pixelbrain/amp-shadow-perception-microprocessor.test.js`

**Interfaces:**
- Consumes: `runShadowPerceptionAmp` (Task 1); the existing `verseIRMicroprocessors` registry (already imported at top of `index.js`).
- Produces: a registered processor key `'amp.shadow-perception'` callable as
  `await verseIRMicroprocessors.execute('amp.shadow-perception', { coordinates, vectorField, cols, rows }, context)` returning `{ ampId, shadowField }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/pixelbrain/amp-shadow-perception-microprocessor.test.js
import { describe, expect, it } from 'vitest';
import { verseIRMicroprocessors } from '../../codex/core/microprocessors/index.js';
import { SHADOW_SCALARS } from '../../codex/core/pixelbrain/shadow-perception-amp.js';

describe('amp.shadow-perception microprocessor', () => {
  it('runs the shadow-perception amp through the registry', async () => {
    const result = await verseIRMicroprocessors.execute('amp.shadow-perception', {
      coordinates: [{ col: 1, row: 0, color: '#223344', colorIntensity: { role: 'cold_chroma' } }],
      vectorField: [],
      cols: 2,
      rows: 1,
    });
    expect(Array.from(result.shadowField)).toEqual([SHADOW_SCALARS.NONE, SHADOW_SCALARS.POCKET]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pixelbrain/amp-shadow-perception-microprocessor.test.js`
Expected: FAIL — no processor registered for `amp.shadow-perception` (execute rejects/throws).

- [ ] **Step 3: Add the registration**

In `codex/core/microprocessors/index.js`, immediately after the existing
`verseIRMicroprocessors.register('amp.coord-symmetry', ...)` block, add:

```js
verseIRMicroprocessors.register('amp.shadow-perception', async (payload, _context) => {
  const { runShadowPerceptionAmp } = await import('../pixelbrain/shadow-perception-amp.js');
  return runShadowPerceptionAmp(payload);
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pixelbrain/amp-shadow-perception-microprocessor.test.js`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add codex/core/microprocessors/index.js tests/pixelbrain/amp-shadow-perception-microprocessor.test.js
git commit -m "feat(microprocessors): register amp.shadow-perception"
```

---

### Task 3: Lattice perception bridge

**Files:**
- Create: `codex/core/pixelbrain/lattice-perception-bridge.js`
- Test: `tests/pixelbrain/lattice-perception-bridge.test.js`

**Interfaces:**
- Consumes:
  - `buildCellSignatures`, `diffCellSignatures`, `diffShadowField`, `assemblePerceptionFrame` from `../../src/lib/photonic-retina/index.js`.
  - `buildCommittedMask` from `./qbit-placement-memory.js`.
- Produces:
  - `buildLatticePerceptionFrame({ lattice, shadowField, cols, rows, previous, generation }) => { frame, snapshot }` where:
    - `lattice.cells` is a `Map<"col,row", { col, row, color, emphasis, symmetrySource? }>`.
    - `cols`/`rows` are the lattice grid dimensions.
    - `shadowField` is the `Float64Array` from `runShadowPerceptionAmp`.
    - `previous` is a prior `snapshot` (or `null` on first generation).
    - `frame` is the `PerceptionFrame` from `assemblePerceptionFrame`.
    - `snapshot` is `{ cells: Float64Array, shadow: Float64Array }` to thread back as `previous` next generation.
  - Placement evidence per occupied cell: `{ snapStable: true, symmetryAgreement: cell.symmetrySource === 'original' ? 1 : 0.5, energy: clamp01(cell.emphasis) }`. Empty cells → `null` evidence (→ not committed). `snapStable` is `true` because the lattice path always snaps to grid; empty cells get `null` evidence regardless.

- [ ] **Step 1: Write the failing test**

```js
// tests/pixelbrain/lattice-perception-bridge.test.js
import { describe, expect, it } from 'vitest';
import { buildLatticePerceptionFrame } from '../../codex/core/pixelbrain/lattice-perception-bridge.js';

const cols = 2;
const rows = 2;

function latticeFrom(entries) {
  const cells = new Map();
  for (const e of entries) cells.set(`${e.col},${e.row}`, e);
  return { cells };
}

describe('buildLatticePerceptionFrame', () => {
  it('first generation (no previous) attends every occupied-or-changed cell', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
    ]);
    const shadowField = Float64Array.from([0, 0, 0, 0]);
    const { frame, snapshot } = buildLatticePerceptionFrame({
      lattice, shadowField, cols, rows, previous: null, generation: 0,
    });
    expect(frame.cellCount).toBe(4);
    // first tick: diffCellSignatures(null, curr) => all changed; none committed yet matters
    // but committed cell 0 (snapStable+symmetric+energy) is committed => not attended
    // cells 1..3 empty => changed=1 (first tick), committed=0 => attended
    expect(Array.from(frame.attendIndices)).toEqual([1, 2, 3]);
    expect(snapshot.cells.length).toBe(4);
  });

  it('the core win: identical lattice + identical shadow next generation attends nothing', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 0, color: '#445566', emphasis: 1, symmetrySource: 'original' },
      { col: 0, row: 1, color: '#778899', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 1, color: '#aabbcc', emphasis: 1, symmetrySource: 'original' },
    ]);
    const shadowField = Float64Array.from([0, 0, 0, 0]);
    const first = buildLatticePerceptionFrame({ lattice, shadowField, cols, rows, previous: null, generation: 0 });
    const second = buildLatticePerceptionFrame({
      lattice, shadowField, cols, rows, previous: first.snapshot, generation: 1,
    });
    expect(Array.from(second.frame.attendIndices)).toEqual([]);
  });

  it('non-local shadow re-wakes a committed, unchanged cell', () => {
    const lattice = latticeFrom([
      { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' },
      { col: 1, row: 0, color: '#445566', emphasis: 1, symmetrySource: 'original' },
    ]);
    const prevShadow = Float64Array.from([0, 0, 0, 0]);
    const first = buildLatticePerceptionFrame({ lattice, shadowField: prevShadow, cols, rows, previous: null, generation: 0 });
    // cell (1,0)=index 1 shadow shifts; lattice unchanged
    const nextShadow = Float64Array.from([0, 0.25, 0, 0]);
    const second = buildLatticePerceptionFrame({
      lattice, shadowField: nextShadow, cols, rows, previous: first.snapshot, generation: 1,
    });
    expect(Array.from(second.frame.attendIndices)).toEqual([1]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pixelbrain/lattice-perception-bridge.test.js`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/pixelbrain/lattice-perception-bridge.js
//
// Joins the live lattice generation to the photonic-retina perception eye.
// Maps lattice.cells -> dense row-major grid, derives the three channels, and
// returns a PerceptionFrame plus a snapshot to thread into the next generation.
// Deterministic; no Date.now / Math.random.

import {
  buildCellSignatures,
  diffCellSignatures,
  diffShadowField,
  assemblePerceptionFrame,
} from '../../src/lib/photonic-retina/index.js';
import { buildCommittedMask } from './qbit-placement-memory.js';

function clamp01(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

export function buildLatticePerceptionFrame({ lattice, shadowField, cols, rows, previous = null, generation = 0 }) {
  const total = cols * rows;
  const denseCells = new Array(total).fill(null);
  const evidence = new Array(total).fill(null);

  const cellMap = lattice && lattice.cells instanceof Map ? lattice.cells : new Map();
  for (const cell of cellMap.values()) {
    const col = Number(cell?.col);
    const row = Number(cell?.row);
    if (!Number.isInteger(col) || !Number.isInteger(row) || col < 0 || row < 0 || col >= cols || row >= rows) continue;
    const index = (row * cols) + col;
    denseCells[index] = { color: cell.color, emphasis: cell.emphasis, occupied: true };
    evidence[index] = {
      snapStable: true,
      symmetryAgreement: cell.symmetrySource === 'original' ? 1 : 0.5,
      energy: clamp01(cell.emphasis),
    };
  }

  const currCells = buildCellSignatures(denseCells);
  const changedMask = diffCellSignatures(previous ? previous.cells : null, currCells);
  const committedMask = buildCommittedMask(evidence, { generation });
  const currShadow = shadowField instanceof Float64Array ? shadowField : Float64Array.from(shadowField || []);
  const shadowMask = diffShadowField(previous ? previous.shadow : null, currShadow);

  const frame = assemblePerceptionFrame({ changedMask, committedMask, shadowMask, rows, cols, generation });

  return { frame, snapshot: { cells: currCells, shadow: currShadow } };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pixelbrain/lattice-perception-bridge.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/lattice-perception-bridge.js tests/pixelbrain/lattice-perception-bridge.test.js
git commit -m "feat(pixelbrain): lattice perception bridge (live three-channel frame)"
```

---

### Task 4: Wire opt-in perception into `generateLatticeGrid`

**Files:**
- Modify: `codex/core/pixelbrain/lattice-grid-engine.js`
- Test: `tests/pixelbrain/lattice-grid-perception-wire.test.js`

**Interfaces:**
- Consumes: `verseIRMicroprocessors` (for `amp.shadow-perception`) and `buildLatticePerceptionFrame` (Task 3).
- Produces: when `generateLatticeGrid(analysis, options)` is called with `options.perception = { enabled: true, previous, generation }`, the returned lattice gains a `perception` property `{ frame, snapshot }`. When `options.perception` is absent/disabled, the returned lattice is byte-for-byte unchanged (no `perception` property).

**Note for implementer:** Read the top ~180 lines of `lattice-grid-engine.js` to find where `generateLatticeGrid` finishes building `lattice` (or `transformedLattice`) and returns it. The perception block runs AFTER the cells + symmetry are final, deriving `cols`/`rows` from the lattice's existing grid metadata (the same `col`/`row` range used to key `lattice.cells`). Build `coordinates` for the shadow amp from `lattice.cells` values (each `{ col, row, color, emphasis }`); pass `vectorField: []` for now (the live lattice path has no vector field — shadow will be all-NONE until a vector source is added, which is acceptable and tested). Thread `options.perception.previous` and `.generation`. Attach `lattice.perception = { frame, snapshot }` before returning. If `generateLatticeGrid` has an early-return path (e.g., the non-significant-symmetry branch), attach perception on that returned lattice too, OR gate so the perception block runs on whichever lattice object is actually returned.

- [ ] **Step 1: Write the failing test**

```js
// tests/pixelbrain/lattice-grid-perception-wire.test.js
import { describe, expect, it, vi } from 'vitest';

// generateLatticeGrid runs microprocessor AMPs (symmetry) that may require
// async/TS runtime; this test exercises the perception wiring on a prebuilt
// lattice via the exported helper path. If generateLatticeGrid is not callable
// headless, the implementer must expose the perception step as a small pure
// function applyLatticePerception(lattice, cols, rows, options) and test THAT.

import { applyLatticePerception } from '../../codex/core/pixelbrain/lattice-grid-engine.js';

const cols = 2;
const rows = 1;
function lattice() {
  const cells = new Map();
  cells.set('0,0', { col: 0, row: 0, color: '#112233', emphasis: 1, symmetrySource: 'original' });
  return { cells };
}

describe('lattice perception wiring', () => {
  it('attaches a perception frame when enabled', async () => {
    const out = await applyLatticePerception(lattice(), cols, rows, { enabled: true, previous: null, generation: 0 });
    expect(out.perception).toBeTruthy();
    expect(out.perception.frame.cellCount).toBe(2);
    expect(out.perception.snapshot.cells.length).toBe(2);
  });

  it('leaves the lattice untouched when disabled', async () => {
    const lat = lattice();
    const out = await applyLatticePerception(lat, cols, rows, { enabled: false });
    expect(out.perception).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pixelbrain/lattice-grid-perception-wire.test.js`
Expected: FAIL — `applyLatticePerception` is not exported.

- [ ] **Step 3: Implement `applyLatticePerception` and call it from `generateLatticeGrid`**

Add to `codex/core/pixelbrain/lattice-grid-engine.js`:

```js
import { verseIRMicroprocessors } from '../microprocessors/index.js';
import { buildLatticePerceptionFrame } from './lattice-perception-bridge.js';

/**
 * Opt-in perception step. Runs the shadow-perception microprocessor over the
 * lattice cells and assembles a PerceptionFrame. Returns the SAME lattice object
 * with a `perception` property attached when enabled; untouched when disabled.
 */
export async function applyLatticePerception(lattice, cols, rows, perceptionOptions = {}) {
  if (!perceptionOptions || perceptionOptions.enabled !== true) return lattice;

  const coordinates = Array.from(lattice.cells.values()).map((c) => ({
    col: c.col, row: c.row, color: c.color, emphasis: c.emphasis,
    colorIntensity: c.colorIntensity,
  }));

  const { shadowField } = await verseIRMicroprocessors.execute('amp.shadow-perception', {
    coordinates, vectorField: [], cols, rows,
  });

  const { frame, snapshot } = buildLatticePerceptionFrame({
    lattice, shadowField, cols, rows,
    previous: perceptionOptions.previous || null,
    generation: Number.isInteger(perceptionOptions.generation) ? perceptionOptions.generation : 0,
  });

  lattice.perception = { frame, snapshot };
  return lattice;
}
```

Then, in `generateLatticeGrid`, immediately before each `return` of a lattice object, await the perception step (it is a no-op when disabled):

```js
// derive cols/rows from the lattice's grid metadata (the col/row range used to
// key lattice.cells — use the existing grid dimension variables in this function)
await applyLatticePerception(lattice, gridCols, gridRows, options?.perception);
return lattice;
```

(Use the actual grid-dimension variable names present in `generateLatticeGrid`; if they are not already computed, derive them from the cell `col`/`row` maxima + 1.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/pixelbrain/lattice-grid-perception-wire.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Run the existing lattice + full perception suites for no regressions**

Run: `npx vitest run tests/pixelbrain tests/photonic-retina`
Expected: PASS — existing lattice tests unaffected (perception is opt-in), all perception tests green.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/lattice-grid-engine.js tests/pixelbrain/lattice-grid-perception-wire.test.js
git commit -m "feat(pixelbrain): opt-in perception frame from live generateLatticeGrid"
```

---

## Deferred (NOT in this plan)

- **Acting on `attendMask`** — using the frame to actually SKIP regenerating settled cells in `generateLatticeGrid` (a perf change to the generation loop). This plan emits the frame; consuming it to gate work is the next step.
- **Caller state threading in `LatticeCanvas.jsx`** — holding `previous` snapshot across React generations (a `useRef`) and passing `options.perception`. UI change, separate task.
- **Real vector field for shadows** — the live lattice path has no `vectorField` yet, so `shadowMask` is all-NONE until one is supplied; edge/pocket shadows activate when a vector source is added.

## Self-Review

- **Spec coverage:** shadow microprocessor (Tasks 1–2), three-channel frame from real lattice cells + real symmetry/snap/emphasis evidence (Task 3), opt-in live wiring with default path unchanged (Task 4). Core-win and non-local-shadow regressions covered (Task 3). Acting on attendMask + UI threading + real vectorField explicitly deferred.
- **Placeholder scan:** none — every code/test step is complete. Task 4 Step 3 intentionally instructs the implementer to use the real in-function grid-dimension variables (the one detail that cannot be known without reading the function); the `applyLatticePerception` helper it adds is fully specified and independently tested.
- **Type consistency:** `shadowField` is `Float64Array` everywhere; `snapshot` shape `{cells, shadow}` consistent across Tasks 3–4; evidence shape (`snapStable`/`symmetryAgreement`/`energy`) matches `qbit-placement-memory.js`; mask/frame names match the existing perception core.
