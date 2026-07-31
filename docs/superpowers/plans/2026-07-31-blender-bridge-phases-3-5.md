# Blender Bridge Phases 3–5 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Revive the simulation chain, make the cross-engine comparison capable of agreeing honestly, and give the temporal frame a reader.

**Architecture:** Three independent repairs sharing one theme — a claim that could not be checked. The sim chain dies on an RNA property renamed five releases ago; `COLOR_LAW` is declared `SHOULD_AGREE` while its canonical encodes the output file format two engines can never share; and `formatForWire` emits a shape no consumer reads.

**Tech Stack:** Node 20 ESM + vitest, Blender 5.2.0 LTS embedded Python 3.13 + numpy, Cycles CPU.

## Global Constraints

Everything from `2026-07-30-blender-bridge-phases-0-2.md` still applies. In addition:

- **Blender 5.2 RNA:** `RigidBodyWorld` exposes `substeps_per_frame` and `solver_iterations`. `steps_per_second` does not exist and has not since 2.91.
- **`substeps_per_frame` is not a renamed `steps_per_second`.** They are different quantities: one is per-frame, one is per-second, related by scene fps. Any translation must be declared, not inferred.
- **Changing a slot canonical changes every receipt.** `RENDER_VERSION` must bump in the same commit, or old and new receipts become silently incomparable.
- **A temporal frame is not a render packet.** It carries no `z` and no colour. It gets its own consumer; it is not coerced into `ingest_wire`.
- Invoke Blender only through `runBlenderScript` (`codex/core/blender-bridge/blender-run.js`). Direct `execSync` reintroduces the exit-0 blindness Phase 0 removed.
- Baseline at start: 238/238 JS green, 8/9 Blender suites green, `test_sim_scene.py` red on `steps_per_second`.

---

## File Structure

**Phase 3 — sim chain**
- Modify `blender/addons/scholomance_pixelbrain/sim_scene.py` — `substeps_per_frame`, RNA guard.
- Modify `blender/tests/test_sim_scene.py`
- Modify `scripts/blender-sim-e2e.mjs` — route through `blender-run.js`.

**Phase 4 — cross-engine honesty**
- Modify `codex/core/blender-bridge/render-scd64.js` — `COLOR_LAW` and `ENGINE_LAW` canonicals, `RENDER_VERSION` bump.
- Modify `codex/core/blender-bridge/receipt.js` — thread `colorPolicy`/`transfer` through.
- Modify `codex/core/blender-bridge/cross-engine.js` — verdict lattice, Remotion claim.
- Modify `blender/addons/scholomance_pixelbrain/render_claim.py` — report the declared policy.
- Modify `tests/codex/core/blender-bridge/render-scd64.test.js`, `cross-engine.test.js`

**Phase 5 — the dead letter**
- Modify `codex/core/pixelbrain/temporal/temporal-compiler.js` — `formatForWire` emits a declared contract.
- Create `blender/addons/scholomance_pixelbrain/temporal_ingest.py` — the reader.
- Create `blender/tests/test_temporal_ingest.py`
- Modify `tests/codex/core/pixelbrain/temporal/temporal-layer.test.js`

---

# PHASE 3 — THE SIM CHAIN

### Task 1: Re-declare the rigid body step budget

**Files:**
- Modify: `blender/addons/scholomance_pixelbrain/sim_scene.py:73-87`
- Test: `blender/tests/test_sim_scene.py`

**Interfaces:**
- Produces: `setup_rigid_body_world(scene, substeps_per_frame=SUBSTEPS_PER_FRAME, solver_iterations=SOLVER_ITERATIONS)`, plus module constants `SUBSTEPS_PER_FRAME = 10` and `SOLVER_ITERATIONS = 10`.

**The units decision, stated because it cannot be derived.** The old call passed `steps_per_second=60`. Blender 5.2 has only `substeps_per_frame`. These are related by `steps_per_second = substeps_per_frame × fps`, so translating 60 steps/sec at the scene's 24 fps gives 2.5 substeps/frame — not an integer, and fps-dependent, which makes the simulation's determinism a function of the frame rate. A fixed substep count is what determinism actually needs, so the budget is re-declared directly as `10` (Blender's own default) and the fps coupling is dropped.

- [ ] **Step 1: Write the failing test**

In `blender/tests/test_sim_scene.py`, replace the `steps_per_second` call in `test_setup_rigid_body_world`:

```python
    def test_setup_rigid_body_world(self):
        scene = bpy.context.scene
        rb_world = setup_rigid_body_world(scene, substeps_per_frame=10, solver_iterations=10)
        self.assertIsNotNone(rb_world)
        self.assertEqual(rb_world.substeps_per_frame, 10)
        self.assertEqual(rb_world.solver_iterations, 10)
        # steps_per_second was removed in Blender 2.91. Asserting its absence
        # keeps a future "helpful" reintroduction from silently reappearing.
        self.assertFalse(hasattr(rb_world, "steps_per_second"))
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_sim_scene.py`
Expected: FAIL — `setup_rigid_body_world() got an unexpected keyword argument 'substeps_per_frame'`

- [ ] **Step 3: Implement**

In `blender/addons/scholomance_pixelbrain/sim_scene.py`, add module constants above `setup_rigid_body_world`:

```python
# Rigid body step budget. DECLARED, not translated.
#
# This used to pass steps_per_second=60 to an RNA property Blender removed in
# 2.91. The replacement is substeps_per_frame, which is NOT the same quantity:
# steps_per_second = substeps_per_frame x fps. Translating 60 steps/sec at the
# scene's 24 fps gives 2.5 substeps/frame -- not an integer, and worse, it makes
# the simulation's determinism a function of the frame rate.
#
# A fixed substep count is what determinism needs, so the budget is declared
# directly and the fps coupling dropped. 10 is Blender's own default.
SUBSTEPS_PER_FRAME = 10
SOLVER_ITERATIONS = 10
```

Replace the function:

```python
def setup_rigid_body_world(scene, substeps_per_frame=SUBSTEPS_PER_FRAME,
                           solver_iterations=SOLVER_ITERATIONS):
    """
    Configure the rigid body world for deterministic simulation.
    Fixed substep count, fixed solver iterations.
    """
    rb_world = scene.rigidbody_world
    if rb_world is None:
        bpy.ops.rigidbody.world_add()
        rb_world = scene.rigidbody_world

    # Fail loudly on the next rename rather than silently simulating with
    # whatever defaults happen to be in place. The previous rename cost four
    # red tests and an E2E that reported a missing file instead of the cause.
    if not hasattr(rb_world, "substeps_per_frame"):
        raise AttributeError(
            "RigidBodyWorld has no 'substeps_per_frame' on this Blender build "
            f"({bpy.app.version_string}). The rigid body step budget cannot be "
            "declared, so the simulation would run at an undeclared timestep."
        )

    rb_world.substeps_per_frame = substeps_per_frame
    rb_world.solver_iterations = solver_iterations
    rb_world.use_split_impulse = True

    return rb_world
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./scripts/blender-test.sh blender/tests/test_sim_scene.py`
Expected: PASS, `Ran 6 tests`, `OK`

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/sim_scene.py blender/tests/test_sim_scene.py
git commit -m "fix(blender-sim): declare the rigid body step budget

steps_per_second was removed in Blender 2.91 and the call site never
followed, so every rigid body test errored and the sim E2E reported a
missing manifest instead of the cause.

substeps_per_frame is not a renamed steps_per_second: the two are related
by fps, and translating 60 steps/sec at 24 fps gives 2.5 substeps/frame,
which is neither an integer nor fps-independent. The budget is declared
directly instead, and an RNA presence guard fails loudly on the next
rename."
```

---

### Task 2: Route the sim E2E through the failing-capable runner

**Files:**
- Modify: `scripts/blender-sim-e2e.mjs`

**Interfaces:**
- Consumes: `runBlenderScript`, `BlenderRunError` from `codex/core/blender-bridge/blender-run.js`.

- [ ] **Step 1: Write the failing check**

Add a `--self-test` branch immediately after the `BLENDER` existence check, before the work dir is used:

```js
// Falsifier 1, same as the bridge E2E. This driver reported
// "sim_manifest.json not found" for a Python error, because Blender exits 0
// on an uncaught traceback and execSync only throws on a non-zero exit.
if (process.argv.includes('--self-test')) {
  const selfDir = mkdtempSync(join(tmpdir(), 'pb-sim-selftest-'));
  let detected = false;
  try {
    runBlenderScript({
      blender: BLENDER,
      body: 'raise RuntimeError("deliberate self-test failure")',
      scriptPath: join(selfDir, 'selftest.py'),
    });
  } catch (err) {
    detected = err instanceof BlenderRunError;
  }
  console.log(`[sim-e2e] self-test: Blender failure detected = ${detected}`);
  process.exit(detected ? 0 : 1);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/blender-sim-e2e.mjs --self-test`
Expected: FAIL — `runBlenderScript is not defined`

- [ ] **Step 3: Implement**

Add the import:

```js
import { runBlenderScript, BlenderRunError } from '../codex/core/blender-bridge/blender-run.js';
```

Replace the `execSync` invocation block with:

```js
console.log('[sim-e2e] Invoking Blender headless...');
try {
  const { blenderLines } = runBlenderScript({
    blender: BLENDER,
    body: blenderScript,
    scriptPath: join(workDir, 'sim_render.py'),
    timeout: 600000,
  });
  console.log(blenderLines.join('\n'));
} catch (err) {
  console.error('[sim-e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}
```

Remove the now-unused `execSync` import. Also delete the `import sys, json, os` line from the top of the generated `blenderScript`, because `wrapPythonBody` supplies `sys`; keep `json` and `os` by changing that line to `import json, os`.

Update the call inside the generated script to name the substep budget:

```python
setup_rigid_body_world(scene, substeps_per_frame=10, solver_iterations=10)
```

- [ ] **Step 4: Verify**

```bash
node scripts/blender-sim-e2e.mjs --self-test; echo "selftest exit=$?"
node scripts/blender-sim-e2e.mjs 3; echo "sim exit=$?"
```

Expected: self-test reports `true`, exit 0. The sim run reports a frame count and a chain verdict, exit 0. If it still fails, the error is now the real one rather than a missing file.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender-sim-e2e.mjs
git commit -m "fix(blender-sim): route the sim E2E through blender-run

Adds --self-test. This driver reported 'sim_manifest.json not found' for
an AttributeError, because Blender exits 0 on an uncaught traceback and
execSync only throws on a non-zero exit -- the missing manifest was a
downstream symptom of an error the driver could not see."
```

---

# PHASE 4 — CROSS-ENGINE HONESTY

### Task 3: Move file format out of COLOR_LAW

**Files:**
- Modify: `codex/core/blender-bridge/render-scd64.js:18` (version), `:57-106` (canonicals)
- Modify: `codex/core/blender-bridge/receipt.js:51-86`
- Modify: `blender/addons/scholomance_pixelbrain/render_claim.py`
- Test: `tests/codex/core/blender-bridge/render-scd64.test.js`

**Interfaces:**
- Produces: `RENDER_VERSION = 0x02`. `COLOR_LAW` canonical becomes `${colorPolicy}:${transfer}:${viewTransform}:${look}`. `ENGINE_LAW` canonical becomes `${blenderVersion}+${buildHash}:${engine}:${device}:${displayDevice}:${format}:${colorDepth}`. `buildRenderCanonicals` accepts two new inputs: `colorPolicy` (default `'EXACT'`) and `transfer` (default `COLOR_LAW_TRANSFER`).

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/blender-bridge/render-scd64.test.js`:

```js
describe('COLOR_LAW carries the colour contract, not the file format', () => {
  const base = {
    viewTransform: 'Standard', look: 'None', displayDevice: 'sRGB',
    colorPolicy: 'EXACT', transfer: 'sRGB-IEC-61966-2-1',
  };

  function colorLawOf(inputs) {
    return buildRenderCanonicals(inputs).find((c) => c.slot === 'COLOR_LAW').canonical;
  }
  function engineLawOf(inputs) {
    return buildRenderCanonicals(inputs).find((c) => c.slot === 'ENGINE_LAW').canonical;
  }

  it('is unchanged by the output file format', () => {
    // The whole point. An EXR renderer and an RGBA8 canvas can never share a
    // format, so encoding it here made COLOR_LAW: SHOULD_AGREE unsatisfiable.
    const exr = colorLawOf({ ...base, format: 'OPEN_EXR', colorDepth: '32' });
    const png = colorLawOf({ ...base, format: 'PNG', colorDepth: '8' });
    expect(exr).toBe(png);
  });

  it('changes when the declared policy changes', () => {
    expect(colorLawOf({ ...base, colorPolicy: 'EXACT' }))
      .not.toBe(colorLawOf({ ...base, colorPolicy: 'SYNTHESIZED' }));
  });

  it('changes when the transfer function changes', () => {
    expect(colorLawOf({ ...base, transfer: 'sRGB-IEC-61966-2-1' }))
      .not.toBe(colorLawOf({ ...base, transfer: 'none' }));
  });

  it('changes when the view transform changes', () => {
    expect(colorLawOf({ ...base, viewTransform: 'Standard' }))
      .not.toBe(colorLawOf({ ...base, viewTransform: 'AgX' }));
  });

  it('moves the file format into ENGINE_LAW, where divergence is expected', () => {
    const exr = engineLawOf({ ...base, format: 'OPEN_EXR', colorDepth: '32' });
    const png = engineLawOf({ ...base, format: 'PNG', colorDepth: '8' });
    expect(exr).not.toBe(png);
    expect(exr).toContain('OPEN_EXR');
  });

  it('bumps RENDER_VERSION, because every receipt just changed', () => {
    // Without a version bump, receipts minted before and after this change look
    // comparable and are not.
    expect(RENDER_VERSION).toBe(0x02);
  });
});
```

Ensure `buildRenderCanonicals` and `RENDER_VERSION` are imported at the top of that file.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/render-scd64.test.js`
Expected: FAIL — the format test fails (formats produce different COLOR_LAW), and `RENDER_VERSION` is 1.

- [ ] **Step 3: Implement**

In `codex/core/blender-bridge/render-scd64.js`:

```js
export const RENDER_VERSION = 0x02;
```

Add to the import block at the top:

```js
import { COLOR_LAW_TRANSFER } from './color-law.js';
```

In `buildRenderCanonicals`, add the two new destructured inputs alongside the existing colour ones:

```js
    colorPolicy = 'EXACT',
    transfer = COLOR_LAW_TRANSFER,
```

Replace the two canonical lines:

```js
    { slot: 'ENGINE_LAW', canonical: `${blenderVersion}+${buildHash}:${engine}:${device}:${displayDevice}:${format}:${colorDepth}` },
```

```js
    // The COLOUR CONTRACT, not the container. Both engines must honour the same
    // policy and transfer function; they will never share an output format, and
    // encoding one here made expectedCrossEngineAgreement's SHOULD_AGREE
    // impossible to satisfy for any correct implementation.
    { slot: 'COLOR_LAW', canonical: `${colorPolicy}:${transfer}:${viewTransform}:${look}` },
```

In `codex/core/blender-bridge/receipt.js`, add to the `inputs` object in `mintReceipt`:

```js
    colorPolicy: claim.colorPolicy ?? observed.colorPolicy ?? 'EXACT',
    transfer: observed.transfer ?? '',
```

In `blender/addons/scholomance_pixelbrain/render_claim.py`, add to the `observed` dict in `emit_claim`:

```python
            # Reported, not computed. The transfer function is declared on the
            # wire by color-law.js; the addon states which one it was handed.
            "transfer": wire.get("colorLaw", {}).get("transfer", ""),
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex/core/blender-bridge/
```

Expected: PASS. Receipt SCD64 values in any snapshot-style assertions will have changed; update them to the new measured values, and note in the commit that they changed because the contract did.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/render-scd64.js codex/core/blender-bridge/receipt.js blender/addons/scholomance_pixelbrain/render_claim.py tests/codex/core/blender-bridge/render-scd64.test.js
git commit -m "fix(render-scd64): COLOR_LAW carries the colour contract, not the container

The slot's canonical was viewTransform:look:displayDevice:format:colorDepth
-- the output FILE FORMAT. An EXR renderer and an RGBA8 canvas can never
share that, yet expectedCrossEngineAgreement declares the slot
SHOULD_AGREE. The declaration and the construction contradicted each
other, and no correct implementation could have satisfied both.

COLOR_LAW is now policy:transfer:viewTransform:look. Format, colour depth
and display device move to ENGINE_LAW, which is already EXPECTED_DIVERGE.

RENDER_VERSION bumps to 0x02 in the same commit: every receipt just
changed, and without the bump old and new ones look comparable."
```

---

### Task 4: Give the alarming cross-engine outcome its own verdict

**Files:**
- Modify: `codex/core/blender-bridge/cross-engine.js:36-41` (verdict list), `:83-90` (lattice), `:123-147` (Remotion claim)
- Test: `tests/codex/core/blender-bridge/cross-engine.test.js`

**Interfaces:**
- Produces: `CROSS_ENGINE_VERDICTS` gains `'CAUSES_DIVERGE_PIXELS_AGREE'`. `buildRemotionClaim` emits `colorPolicy` and `observed.transfer`.

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/blender-bridge/cross-engine.test.js`:

```js
describe('the alarming outcome is not filed under the benign one', () => {
  it('distinguishes causes-diverge-but-pixels-agree from pixels-agree', () => {
    // Two engines that consumed DIFFERENT inputs and produced IDENTICAL pixels
    // is the most alarming result available. It was reported as PIXELS_AGREE,
    // the same label as the benign case where causes also agreed.
    const a = { scd64: 'A'.repeat(64) };
    const b = { scd64: `${'B'.repeat(56)}${'A'.repeat(8)}` };
    const result = compareCrossEngine(a, b);
    expect(result.pixelsAgree).toBe(true);
    expect(result.verdict).toBe('CAUSES_DIVERGE_PIXELS_AGREE');
    expect(result.healthy).toBe(false);
  });

  it('still reports PIXELS_AGREE when the causes agree too', () => {
    const same = { scd64: 'C'.repeat(64) };
    expect(compareCrossEngine(same, { ...same }).verdict).toBe('PIXELS_AGREE');
  });
});

describe('the Remotion claim carries the colour contract', () => {
  it('declares the policy and transfer so COLOR_LAW can agree', () => {
    const wire = {
      packetId: 'P', sourceChecksum: 'S', colorPolicy: 'EXACT',
      canvas: { width: 4, height: 4 },
      colorLaw: { transfer: 'sRGB-IEC-61966-2-1' },
    };
    const claim = buildRemotionClaim(wire);
    expect(claim.colorPolicy).toBe('EXACT');
    expect(claim.observed.transfer).toBe('sRGB-IEC-61966-2-1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/cross-engine.test.js`
Expected: FAIL — verdict is `PIXELS_AGREE`, and `claim.observed.transfer` is undefined.

- [ ] **Step 3: Implement**

In `codex/core/blender-bridge/cross-engine.js`, extend the verdict list:

```js
export const CROSS_ENGINE_VERDICTS = Object.freeze([
  'CAUSES_AGREE',
  'CAUSES_DIVERGE',
  'PIXELS_AGREE',
  'PIXELS_DIVERGE',
  // Two engines that saw different inputs and produced identical pixels. This
  // is not a milder PIXELS_AGREE; it means a cause slot is not reaching the
  // render, so the comparison is measuring less than it claims.
  'CAUSES_DIVERGE_PIXELS_AGREE',
]);
```

Replace the verdict lattice:

```js
  let verdict;
  if (causesAgree && pixelsAgree) verdict = 'PIXELS_AGREE';
  else if (causesAgree && !pixelsAgree) verdict = 'CAUSES_AGREE';
  else if (!causesAgree && pixelsAgree) verdict = 'CAUSES_DIVERGE_PIXELS_AGREE';
  else verdict = 'CAUSES_DIVERGE';
```

In `buildRemotionClaim`, add the colour contract:

```js
    colorPolicy: wire.colorPolicy,
```

and inside `observed`, before the spread of `overrides`:

```js
      transfer: wire.colorLaw?.transfer ?? '',
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex/core/blender-bridge/
node scripts/cross-engine-e2e.mjs; echo "cross-engine exit=$?"
```

Expected: the JS suite passes. The E2E should now report `CAUSES_AGREE` with `COLOR_LAW MATCH`. If a cause slot still diverges, record which one and why rather than adjusting the expectation to fit.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/cross-engine.js tests/codex/core/blender-bridge/cross-engine.test.js
git commit -m "fix(cross-engine): stop filing the alarming outcome under the benign one

if (!causesAgree && pixelsAgree) returned PIXELS_AGREE -- the same verdict
as the case where causes agreed too. Two engines that consumed different
inputs and produced identical pixels is the most alarming result the
comparison can yield: it means a cause slot is not reaching the render.
It now has its own verdict and is never healthy.

The Remotion claim also carries colorPolicy and transfer, so COLOR_LAW has
something to agree ON now that it encodes the contract rather than the
container."
```

---

# PHASE 5 — THE DEAD LETTER

### Task 5: Make `formatForWire` emit a declared contract

**Files:**
- Modify: `codex/core/pixelbrain/temporal/temporal-compiler.js:236-266`
- Test: `tests/codex/core/pixelbrain/temporal/temporal-layer.test.js`

**Interfaces:**
- Produces: `TEMPORAL_FRAME_CONTRACT = 'PB-TEMPORAL-FRAME-v1'`. `formatForWire` returns `{ contract, frame, time, projectionChecksum, vertexCount, positions: {x, y}, partIds, partIndex, energyBindings, wireVersion }` with `positions.x`/`positions.y` as quantized int32 arrays at `SCALES.PIXEL`, and `partIndex` an int32 array interning each vertex's `partId`.

**Why not just make it a render packet.** A temporal frame carries no `z` and no colour: it is animation state, not something to rasterise. Coercing it into `ingest_wire`'s shape would mean inventing both. It gets its own contract and its own reader (Task 6).

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/pixelbrain/temporal/temporal-layer.test.js`:

```js
describe('formatForWire emits a contract a consumer can read', () => {
  function frame() {
    return {
      frame: 3,
      time: 0.125,
      projectionChecksum: 'ABCD1234',
      energy: { PHOTONIC: 0.5 },
      state: {
        arm: { spine: [[1.5, 2.5], [3.5, 4.5]] },
        leg: { closedContour: [[5.5, 6.5]] },
      },
    };
  }

  it('names its contract', () => {
    expect(formatForWire(frame()).contract).toBe('PB-TEMPORAL-FRAME-v1');
  });

  it('carries positions as parallel int32 arrays, not objects', () => {
    // The previous shape was vertices:[{x,y,partId,field}]. Python can read it,
    // but nothing did -- and a per-vertex object cannot foreach_set into an
    // attribute, which is how every other wire in this bridge lands.
    const w = formatForWire(frame());
    expect(w.positions.x).toEqual([1, 4, 6]);
    expect(w.positions.y).toEqual([3, 5, 7]);
    expect(w.vertexCount).toBe(3);
  });

  it('interns partId to int, because shaders cannot read STRING attributes', () => {
    const w = formatForWire(frame());
    expect(w.partIds).toEqual(['arm', 'leg']);
    expect(w.partIndex).toEqual([0, 0, 1]);
  });

  it('carries no nulls', () => {
    expect(() => assertNoNulls(formatForWire(frame()))).not.toThrow();
  });

  it('preserves frame identity and the projection checksum', () => {
    const w = formatForWire(frame());
    expect(w.frame).toBe(3);
    expect(w.time).toBe(0.125);
    expect(w.projectionChecksum).toBe('ABCD1234');
  });
});
```

Add to that file's imports:

```js
import { assertNoNulls } from '../../../../../codex/core/blender-bridge/wire.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/temporal/temporal-layer.test.js`
Expected: FAIL — `contract` is undefined and `positions` is undefined.

- [ ] **Step 3: Implement**

In `codex/core/pixelbrain/temporal/temporal-compiler.js`, add near the other contract constant:

```js
export const TEMPORAL_FRAME_CONTRACT = 'PB-TEMPORAL-FRAME-v1';
```

Replace `formatForWire`:

```js
/**
 * Project a compiled frame onto a wire a consumer can actually read.
 *
 * The previous shape emitted vertices:[{x,y,partId,field}] and intersected
 * neither toPythonWire nor ingest_wire -- handing one to ingest_wire raised
 * KeyError: 'coordinateCount'. It was a format with no reader.
 *
 * It is NOT coerced into a render packet. A temporal frame carries no z and no
 * colour, so making it one would mean inventing both. It gets its own contract
 * and its own consumer (temporal_ingest.py), and follows the same wire laws as
 * the render projection: parallel typed arrays, int32, no nulls, categoricals
 * interned because a shader cannot read a STRING attribute.
 */
export function formatForWire(compiledFrame, wireOptions = {}) {
  const { state, energy, time, projectionChecksum, frame } = compiledFrame;

  const partIds = Object.keys(state ?? {}).sort();
  const xs = [];
  const ys = [];
  const partIndex = [];

  partIds.forEach((partId, index) => {
    const part = state[partId];
    if (!part) return;
    for (const field of ['spine', 'closedContour', 'leftBank', 'rightBank']) {
      if (!Array.isArray(part[field])) continue;
      for (const point of part[field]) {
        if (!Array.isArray(point)) continue;
        xs.push(quantize(Number(point[0] ?? 0), SCALES.PIXEL));
        ys.push(quantize(Number(point[1] ?? 0), SCALES.PIXEL));
        partIndex.push(index);
      }
    }
  });

  return {
    contract: TEMPORAL_FRAME_CONTRACT,
    frame,
    time,
    projectionChecksum,
    vertexCount: xs.length,
    positions: { x: xs, y: ys },
    partIds,
    partIndex,
    energyBindings: energy ?? {},
    wireVersion: wireOptions.wireVersion ?? '1.0.0',
  };
}
```

Add the import at the top of the file:

```js
import { quantize, SCALES } from '../../blender-bridge/quantize.js';
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex/core/pixelbrain/temporal/
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/temporal/temporal-compiler.js tests/codex/core/pixelbrain/temporal/temporal-layer.test.js
git commit -m "feat(temporal): give formatForWire a contract a consumer can read

It emitted vertices:[{x,y,partId,field}] and intersected neither
toPythonWire nor ingest_wire -- handing one to ingest_wire raised
KeyError: 'coordinateCount'. A format with no reader.

PB-TEMPORAL-FRAME-v1 follows the same wire laws as the render projection:
parallel int32 arrays rather than per-vertex objects (an object cannot
foreach_set into an attribute), partId interned to int because a shader
cannot read a STRING attribute, and no nulls.

It is deliberately NOT a render packet. A temporal frame carries no z and
no colour, so coercing it would mean inventing both."
```

---

### Task 6: Write the reader

**Files:**
- Create: `blender/addons/scholomance_pixelbrain/temporal_ingest.py`
- Test: `blender/tests/test_temporal_ingest.py`

**Interfaces:**
- Consumes: the `PB-TEMPORAL-FRAME-v1` packet from Task 5.
- Produces: `ingest_temporal_frame(frame_wire)` returning a Blender object carrying a point cloud with a `pb_part_index` INT attribute and `pb_frame` / `pb_time` / `pb_projection_checksum` ID custom properties.

- [ ] **Step 1: Write the failing test**

Create `blender/tests/test_temporal_ingest.py`:

```python
"""
The temporal frame's reader. Without one, PB-TEMPORAL-FRAME-v1 is a format
nothing consumes -- the declared-but-unimplemented pathology this bridge exists
to remove.

Run via: ./scripts/blender-test.sh blender/tests/test_temporal_ingest.py
"""
import sys

import bpy

from scholomance_pixelbrain.temporal_ingest import (
    ingest_temporal_frame,
    find_temporal_frame,
    FRAME_KEY,
)

FAILURES = []


def check(name, fn):
    try:
        fn()
        print(f"  ok    {name}")
    except AssertionError as e:
        FAILURES.append(name)
        print(f"  FAIL  {name}: {e}")
    except Exception as e:
        FAILURES.append(name)
        print(f"  ERROR {name}: {type(e).__name__}: {e}")


FRAME_WIRE = {
    "contract": "PB-TEMPORAL-FRAME-v1",
    "frame": 3,
    "time": 0.125,
    "projectionChecksum": "ABCD1234",
    "vertexCount": 3,
    "positions": {"x": [1, 4, 6], "y": [3, 5, 7]},
    "partIds": ["arm", "leg"],
    "partIndex": [0, 0, 1],
    "energyBindings": {"PHOTONIC": 0.5},
    "wireVersion": "1.0.0",
}


def t_creates_a_point_per_vertex():
    obj = ingest_temporal_frame(FRAME_WIRE)
    assert len(obj.data.attributes["position"].data) == 3


def t_positions_match_the_wire():
    obj = ingest_temporal_frame(FRAME_WIRE)
    p = obj.data.attributes["position"].data[1].vector
    assert abs(p[0] - 4.0) < 1e-6, p[0]
    assert abs(p[1] - 5.0) < 1e-6, p[1]


def t_part_index_lands_as_int():
    obj = ingest_temporal_frame(FRAME_WIRE)
    attr = obj.data.attributes["pb_part_index"]
    assert attr.data_type == "INT", attr.data_type
    assert [d.value for d in attr.data] == [0, 0, 1]


def t_frame_identity_is_carried_not_computed():
    obj = ingest_temporal_frame(FRAME_WIRE)
    assert obj[FRAME_KEY] == 3
    assert obj["pb_projection_checksum"] == "ABCD1234"


def t_refuses_a_packet_that_is_not_a_temporal_frame():
    refused = False
    try:
        ingest_temporal_frame({"contract": "pixelbrain.render.v1", "vertexCount": 0})
    except ValueError:
        refused = True
    assert refused, "a render packet was accepted as a temporal frame"


def t_findable_by_frame_number():
    ingest_temporal_frame(FRAME_WIRE)
    assert find_temporal_frame(3) is not None
    assert find_temporal_frame(999) is None


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_temporal_ingest.py`
Expected: FAIL — `ModuleNotFoundError: No module named 'scholomance_pixelbrain.temporal_ingest'`

- [ ] **Step 3: Implement**

Create `blender/addons/scholomance_pixelbrain/temporal_ingest.py`:

```python
"""
Reader for PB-TEMPORAL-FRAME-v1.

The temporal frame previously had no consumer at all: formatForWire emitted a
shape that intersected neither toPythonWire nor ingest_wire, so handing one to
ingest_wire raised KeyError: 'coordinateCount'. A format nobody reads is the
declared-but-unimplemented pathology this bridge exists to remove, so the
contract gets a reader in the same phase it gets a shape.

This is deliberately NOT ingest_wire. A temporal frame is animation state: it
carries no z and no colour, and inventing either to reuse the render path would
be fabricating data the producer never sent.

Identity lives in ID custom properties, carried and never computed -- the same
law the render ingest follows, for the same reason: datablock names silently
collide-rename.
"""

import bpy

TEMPORAL_FRAME_CONTRACT = "PB-TEMPORAL-FRAME-v1"

FRAME_KEY = "pb_frame"
TIME_KEY = "pb_time"
CHECKSUM_KEY = "pb_projection_checksum"
PART_INDEX_ATTRIBUTE = "pb_part_index"

# Temporal vertices are plane coordinates; the frame declares no depth. Z is set
# to 0 rather than invented, and that choice is recorded here so a reader does
# not mistake a flat frame for a measurement.
TEMPORAL_Z = 0.0


def ingest_temporal_frame(frame_wire):
    """
    Create a point cloud object from a PB-TEMPORAL-FRAME-v1 packet.
    Returns the created object.
    """
    contract = frame_wire.get("contract")
    if contract != TEMPORAL_FRAME_CONTRACT:
        raise ValueError(
            f"expected {TEMPORAL_FRAME_CONTRACT}, got {contract!r}. A render "
            "packet and a temporal frame are different shapes; accepting either "
            "here would mean guessing which one arrived."
        )

    count = int(frame_wire["vertexCount"])
    positions = frame_wire["positions"]
    frame_number = int(frame_wire["frame"])

    pc = bpy.data.pointclouds.new(f"pb_temporal_{frame_number}")
    pc.resize(count)

    flat = []
    for i in range(count):
        flat.extend((float(positions["x"][i]), float(positions["y"][i]), TEMPORAL_Z))
    pc.attributes["position"].data.foreach_set("vector", flat)

    # partId is interned producer-side because a shader cannot read a STRING
    # attribute. The int is what crosses; the table travels beside it.
    part_index = frame_wire.get("partIndex") or []
    if part_index:
        attr = pc.attributes.new(name=PART_INDEX_ATTRIBUTE, type="INT", domain="POINT")
        attr.data.foreach_set("value", list(part_index))

    obj = bpy.data.objects.new(f"pb_temporal_{frame_number}", pc)
    bpy.context.scene.collection.objects.link(obj)

    obj[FRAME_KEY] = frame_number
    obj[TIME_KEY] = float(frame_wire["time"])
    obj[CHECKSUM_KEY] = str(frame_wire["projectionChecksum"])

    return obj


def find_temporal_frame(frame_number):
    """Lookup by custom property. Never by .name — names silently drift."""
    for obj in bpy.data.objects:
        if obj.get(FRAME_KEY) == frame_number:
            return obj
    return None
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/blender-test.sh blender/tests/test_temporal_ingest.py
```

Expected: PASS, `0 failure(s)`.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/temporal_ingest.py blender/tests/test_temporal_ingest.py
git commit -m "feat(blender-temporal): give the temporal frame a reader

PB-TEMPORAL-FRAME-v1 had no consumer -- a format nobody reads is the
declared-but-unimplemented pathology this bridge exists to remove, so the
contract gets a reader in the phase that gives it a shape.

Deliberately not ingest_wire. A temporal frame is animation state with no
z and no colour, and reusing the render path would mean inventing both. Z
is set to 0 explicitly with that choice recorded, so a flat frame is not
mistaken for a measurement. A packet whose contract is not
PB-TEMPORAL-FRAME-v1 is refused rather than guessed at."
```

---

### Task 7: Re-measure and record

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md` (§5 table, status header)

- [ ] **Step 1: Run every suite**

```bash
npx vitest run tests/codex/core/blender-bridge/ tests/codex/core/pixelbrain/temporal/
for t in blender/tests/*.py; do ./scripts/blender-test.sh "$t" >/dev/null 2>&1; rc=$?; n=$(basename "$t"); printf '%-34s exit=%s\n' "$n" "$rc"; done
```

Capture `$?` into a variable before any command substitution runs — `printf ... "$(basename $t)" "$?"` reports 0 for everything, because the substitution resets `$?`.

- [ ] **Step 2: Run every E2E**

```bash
for s in blender-bridge-e2e blender-palette-e2e blender-sim-e2e cross-engine-e2e; do
  node "scripts/$s.mjs" >/dev/null 2>&1; rc=$?; printf '%-24s exit=%s\n' "$s" "$rc"
done
node scripts/blender-bridge-e2e.mjs --self-test >/dev/null 2>&1; echo "bridge self-test exit=$?"
node scripts/blender-sim-e2e.mjs --self-test >/dev/null 2>&1; echo "sim self-test exit=$?"
```

- [ ] **Step 3: Record falsifiers 6 and 7 in the spec**

Update the §5 table's "After" column for rows 6 and 7 with what was observed. Update the status header to `Phases 0–5 IMPLEMENTED`. If either row is still red, record it as red with its measurement — do not mark a row green you did not observe.

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md
git commit -m "docs: record the measured result of blender bridge phases 3-5"
```

---

## Self-Review

**Spec coverage.** §1.3 `steps_per_second` → Task 1. Phase 0 parity for the sim driver → Task 2. §1.4 `COLOR_LAW` slot → Task 3. §1.5 verdict collapse → Task 4. §1.6 dead letter → Tasks 5–6. §5 re-measurement → Task 7.

**Out of scope:** Phase 6 (`PB-CARRIER-v1`) and its falsifiers 8–10.

**Type consistency.** `substeps_per_frame` is the parameter name in Tasks 1 and 2. `RENDER_VERSION` is `0x02` in Task 3 only. `TEMPORAL_FRAME_CONTRACT` / `'PB-TEMPORAL-FRAME-v1'` matches across Tasks 5 and 6. `partIndex` (JS) lands as `pb_part_index` (Blender) in Tasks 5 and 6. `positions: {x, y}` is the shape in both.

**Known risk.** Task 3 changes two slot canonicals, so every stored receipt SCD64 changes. Any test asserting a literal SCD64 will fail and must be updated to the newly measured value — that is a correct consequence of a contract change, not a regression, and the version bump is what makes it detectable. Do not "fix" it by reverting the canonical.
