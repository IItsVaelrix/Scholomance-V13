# Blender Bridge Phases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a Blender failure detectable, then make the asset's colour and its declared PHOTONIC energy actually reach rendered pixels, byte-exactly.

**Architecture:** The colour law (sRGB→linear, IEC 61966-2-1) is computed once JS-side and shipped on the wire as quantized int32. Blender's addon dequantizes into a `FLOAT_COLOR` attribute and drives an Emission shader from it — the consumer applies declared values and never computes a transfer function or a hash. Byte-exactness holds only at `samples = 1`, which becomes part of the EXACT contract rather than a caller preference.

**Tech Stack:** Node 20 ESM + vitest (JS side), Blender 5.2.0 LTS embedded Python 3.13 + numpy (consumer side), Cycles CPU.

## Global Constraints

- Blender is at `$BLENDER` or `~/opt/blender/blender`. Version measured against: **5.2.0 LTS**, build hash `fbe6228777e7`.
- **Only a CPU device exists on this machine** (CUEW init fails). Never set `cycles.device = 'GPU'`.
- **The consumer never computes a hash.** No `hashlib`, no digest call, anywhere under `blender/addons/`. It applies values and reports what it applied.
- **The consumer never computes a transfer function.** After Task 4, no sRGB↔linear maths under `blender/addons/`.
- **No nulls on the wire.** `None` on an RNA property raises `TypeError`; `wire.js:assertNoNulls` enforces this and must keep passing.
- **int32 only.** ID custom properties overflow at `2**31`. Every wire numeric goes through `quantize()`.
- Quantization scales are declared in `codex/core/blender-bridge/quantize.js`: `SCALES.UNIT = 1e6`, `SCALES.PIXEL = 1`, `SCALES.TRANSFORM = 1e5`.
- **`samples = 1` under EXACT policy.** Measured: 6/6 specimens byte-exact at 1 sample, 1/6 at 16, 0/6 at 64 with a Gaussian filter.
- **SCR-017: implicit bindings are forbidden.** Only `PHOTONIC` has a declared energy binding. Do not wire the other seven.
- Blender-side tests run via `./scripts/blender-test.sh <file>`; JS tests via `npx vitest run <file>`.
- Existing baseline that must not regress: `blender-bridge-e2e` REPRODUCED 8/8. `test_sim_scene.py` is **already failing** with 4 `steps_per_second` errors — that is Phase 3 work, not a regression you caused.

---

## File Structure

**Phase 0 — driver honesty**
- Create `codex/core/blender-bridge/blender-run.js` — the single place any driver invokes Blender. Owns exception→exit-code conversion and stderr capture.
- Create `tests/codex/core/blender-bridge/blender-run.test.js`
- Modify `scripts/blender-test.sh` — same protection for the Blender-side test harness.
- Modify `scripts/blender-bridge-e2e.mjs` — route through `blender-run.js`.

**Phase 1 — colour reaches pixels**
- Create `codex/core/blender-bridge/color-law.js` — sole owner of the transfer function.
- Create `tests/codex/core/blender-bridge/color-law.test.js`
- Modify `codex/core/blender-bridge/wire.js` — emit `colors.linear` + `colorLaw`.
- Modify `tests/codex/core/blender-bridge/wire.test.js`
- Modify `blender/addons/scholomance_pixelbrain/ingest.py` — `FLOAT_COLOR` attribute `pb_albedo`.
- Modify `blender/addons/scholomance_pixelbrain/scene.py` — Attribute → Emission.Color.
- Modify `blender/addons/scholomance_pixelbrain/render_claim.py` — enforce `samples = 1` under EXACT.
- Modify `blender/addons/scholomance_pixelbrain/palette.py` — delete `apply_palette_to_material`.
- Modify `blender/tests/test_palette.py` — drop the three vacuous assertions.
- Create `blender/tests/test_color_roundtrip.py` — the byte-exact falsifier.

**Phase 2 — energy reaches pixels**
- Modify `blender/addons/scholomance_pixelbrain/ingest.py` — `FLOAT` attribute `pb_photonic`.
- Modify `blender/addons/scholomance_pixelbrain/scene.py` — Attribute → Emission.Strength.
- Create `blender/tests/test_energy_binding.py`

---

# PHASE 0 — DRIVER HONESTY

Nothing below Phase 0 can be trusted until Phase 0 lands. `blender -b --python` returns **exit 0** when a script raises an uncaught exception, so `execSync` never throws and every driver reports a downstream symptom instead of the real error.

Measured, so you know the fix is aimed correctly:

| invocation | blender exit |
|---|---|
| script raises `RuntimeError` | **0** |
| script calls `sys.exit(3)` | **3** |
| script catches and calls `sys.exit(1)` | **1** |

`sys.exit` propagates fine. Only uncaught exceptions are swallowed. So the fix is to convert uncaught exceptions into `sys.exit(1)` — not to parse stderr for the word "Traceback", which would break on any script that legitimately prints one.

---

### Task 1: `blender-run.js` — a Blender invocation that can fail

**Files:**
- Create: `codex/core/blender-bridge/blender-run.js`
- Test: `tests/codex/core/blender-bridge/blender-run.test.js`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces:
  - `wrapPythonBody(body: string): string` — wraps a Python script body so an uncaught exception becomes `sys.exit(1)`.
  - `runBlenderScript({ blender: string, body: string, scriptPath: string, timeout?: number }): { stdout: string, blenderLines: string[] }` — writes the wrapped script, runs Blender, throws `BlenderRunError` on non-zero exit.
  - `class BlenderRunError extends Error` with a `.stderr` property.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/blender-bridge/blender-run.test.js`:

```js
/**
 * The meta-defect these tests exist for: `blender -b --python` exits 0 when a
 * script raises. execSync only throws on a non-zero exit, so a Python error was
 * indistinguishable from success and three separate broken things looked fine.
 *
 * sys.exit DOES propagate (measured: exit 3 and exit 1), so the fix is to turn
 * uncaught exceptions into sys.exit(1) rather than to grep stderr for
 * "Traceback" — a legitimate script may print one.
 */
import { describe, it, expect } from 'vitest';
import { existsSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  wrapPythonBody,
  runBlenderScript,
  BlenderRunError,
} from '../../../../codex/core/blender-bridge/blender-run.js';

const BLENDER = process.env.BLENDER || join(process.env.HOME, 'opt/blender/blender');
const hasBlender = existsSync(BLENDER);

describe('wrapPythonBody', () => {
  it('keeps the original body reachable', () => {
    expect(wrapPythonBody('print("hello")')).toContain('print("hello")');
  });

  it('converts an uncaught exception into a non-zero exit', () => {
    const wrapped = wrapPythonBody('raise RuntimeError("boom")');
    expect(wrapped).toContain('sys.exit(1)');
    expect(wrapped).toContain('traceback.print_exc()');
  });

  it('lets an explicit SystemExit through unchanged', () => {
    // Test files call sys.exit(0)/sys.exit(1) themselves. Swallowing SystemExit
    // would turn a failing suite into a passing one — the exact bug class.
    expect(wrapPythonBody('pass')).toContain('except SystemExit');
  });

  it('indents the body so it sits inside the try block', () => {
    const wrapped = wrapPythonBody('a = 1\nb = 2');
    expect(wrapped).toContain('    a = 1\n    b = 2');
  });
});

describe.skipIf(!hasBlender)('runBlenderScript', () => {
  it('returns stdout when the script succeeds', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-ok-'));
    const res = runBlenderScript({
      blender: BLENDER,
      body: 'print("[blender] alive")',
      scriptPath: join(dir, 's.py'),
    });
    expect(res.blenderLines).toContain('[blender] alive');
  });

  it('THROWS when the script raises — the whole point', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-boom-'));
    expect(() =>
      runBlenderScript({
        blender: BLENDER,
        body: 'raise RuntimeError("deliberate")',
        scriptPath: join(dir, 's.py'),
      }),
    ).toThrow(BlenderRunError);
  });

  it('carries the traceback text on the error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'pb-run-tb-'));
    try {
      runBlenderScript({
        blender: BLENDER,
        body: 'raise RuntimeError("deliberate")',
        scriptPath: join(dir, 's.py'),
      });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BlenderRunError);
      expect(err.stderr).toContain('deliberate');
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/blender-run.test.js`
Expected: FAIL — `Failed to resolve import ".../blender-run.js"`

- [ ] **Step 3: Write the implementation**

Create `codex/core/blender-bridge/blender-run.js`:

```js
/**
 * blender-run — the only place a driver invokes Blender.
 *
 * `blender -b --python script.py` returns exit 0 when the script raises an
 * uncaught exception. execSync throws only on a non-zero exit, so every driver
 * that called Blender directly could not tell a Python error from success —
 * which is why a renamed RNA property, an unlinked node group, and a receipt
 * describing nothing all looked fine at the same time.
 *
 * Measured on 5.2.0: an uncaught raise exits 0, sys.exit(3) exits 3,
 * a caught exception re-raised as sys.exit(1) exits 1. sys.exit propagates.
 * So the body is wrapped rather than the stderr parsed: grepping for
 * "Traceback" would misfire on any script that legitimately prints one.
 */

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

export class BlenderRunError extends Error {
  constructor(message, stderr = '') {
    super(message);
    this.name = 'BlenderRunError';
    this.stderr = stderr;
  }
}

/**
 * Wrap a Python body so an uncaught exception becomes a non-zero exit.
 *
 * SystemExit is re-raised untouched: test files and drivers call sys.exit
 * themselves, and swallowing it would convert a failing run into a passing one.
 */
export function wrapPythonBody(body) {
  const indented = String(body)
    .split('\n')
    .map((line) => (line.length ? `    ${line}` : line))
    .join('\n');

  return `import sys, traceback
try:
${indented}
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    sys.exit(1)
`;
}

/**
 * Run a Python body inside Blender. Throws BlenderRunError on failure.
 *
 * @returns {{ stdout: string, blenderLines: string[] }}
 */
export function runBlenderScript({ blender, body, scriptPath, timeout = 600000 }) {
  if (typeof blender !== 'string' || blender.length === 0) {
    throw new BlenderRunError('blender must be a non-empty path');
  }
  if (typeof scriptPath !== 'string' || scriptPath.length === 0) {
    throw new BlenderRunError('scriptPath must be a non-empty path');
  }

  writeFileSync(scriptPath, wrapPythonBody(body));

  let stdout;
  try {
    stdout = execSync(`"${blender}" -b --factory-startup --python "${scriptPath}"`, {
      encoding: 'utf8',
      timeout,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (err) {
    const stderr = `${err.stdout ?? ''}${err.stderr ?? ''}` || err.message;
    throw new BlenderRunError(`Blender failed (exit ${err.status ?? '?'})`, stderr);
  }

  return {
    stdout,
    blenderLines: stdout.split('\n').filter((l) => l.startsWith('[blender]')),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/blender-run.test.js`
Expected: PASS, 7 tests

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/blender-run.js tests/codex/core/blender-bridge/blender-run.test.js
git commit -m "feat(blender-bridge): make a Blender failure detectable

blender -b --python exits 0 on an uncaught traceback, so execSync never
threw and a Python error was indistinguishable from success. sys.exit
does propagate (measured: exit 3 and exit 1), so the body is wrapped to
convert uncaught exceptions into sys.exit(1). SystemExit passes through
untouched -- swallowing it would turn a failing suite into a passing one."
```

---

### Task 2: Close the same hole in the Blender-side test harness

**Files:**
- Modify: `scripts/blender-test.sh:38-49`

**Interfaces:**
- Consumes: the exception→`sys.exit(1)` pattern from Task 1 (reimplemented in bash, not imported — this harness must not depend on Node).
- Produces: nothing consumed by later tasks.

`blender-test.sh` prints `PASS` for a test file that raises at import time. No current suite is actually masked by this — they all end in an explicit `sys.exit` — but the hole is real and cheap to close.

- [ ] **Step 1: Write the failing test (a shell check, run by hand)**

```bash
mkdir -p /tmp/pb-harness-check
printf 'raise RuntimeError("deliberate import-time failure")\n' > /tmp/pb-harness-check/test_broken.py
./scripts/blender-test.sh /tmp/pb-harness-check/test_broken.py; echo "harness exit=$?"
```

Expected before the fix: prints `PASS:` and `harness exit=0`.

- [ ] **Step 2: Confirm it fails**

Run the block above. Expected: `PASS` with exit 0 — the bug.

- [ ] **Step 3: Implement**

In `scripts/blender-test.sh`, replace the invocation block (lines 38–42):

```bash
EXIT_CODE=0
"$BLENDER" -b --factory-startup \
    --python-expr "import sys; sys.path.insert(0, '$ADDON_DIR')" \
    --python "$TEST_FILE" \
    2>&1 || EXIT_CODE=$?
```

with:

```bash
# Blender returns exit 0 when a --python script raises an uncaught exception,
# so this harness reported PASS for a test file that never ran. sys.exit DOES
# propagate, so the file is executed via runpy inside a try/except that converts
# any exception into sys.exit(1). SystemExit is re-raised untouched, because the
# suites call sys.exit themselves and swallowing it would invert their verdict.
EXIT_CODE=0
"$BLENDER" -b --factory-startup --python-expr "
import sys, runpy, traceback
sys.path.insert(0, '$ADDON_DIR')
try:
    runpy.run_path('$TEST_FILE', run_name='__main__')
except SystemExit:
    raise
except BaseException:
    traceback.print_exc()
    sys.exit(1)
" 2>&1 || EXIT_CODE=$?
```

- [ ] **Step 4: Verify the check now fails correctly, and real suites still pass**

```bash
./scripts/blender-test.sh /tmp/pb-harness-check/test_broken.py; echo "broken exit=$?"
./scripts/blender-test.sh blender/tests/test_ingest.py; echo "ingest exit=$?"
./scripts/blender-test.sh blender/tests/test_packet.py; echo "packet exit=$?"
./scripts/blender-test.sh blender/tests/test_render_visibility.py; echo "visibility exit=$?"
```

Expected: `broken exit=1` with `FAIL:`; the other three `exit=0` with `PASS:`.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender-test.sh
git commit -m "fix(blender-test): fail on a test file that raises at import

The harness printed PASS for a file that never ran, because Blender exits
0 on an uncaught traceback. Test files are now executed via runpy inside a
try/except that converts an exception to sys.exit(1). SystemExit is
re-raised untouched -- the suites call sys.exit themselves."
```

---

### Task 3: Route the bridge E2E through `blender-run.js`

**Files:**
- Modify: `scripts/blender-bridge-e2e.mjs`

**Interfaces:**
- Consumes: `runBlenderScript`, `BlenderRunError` from Task 1.
- Produces: nothing consumed by later tasks.

- [ ] **Step 1: Add the failing check**

Add to the end of `scripts/blender-bridge-e2e.mjs` a `--self-test` branch that asks Blender to raise and asserts the driver notices:

```js
// Falsifier 1: a Blender failure must be detected. Run with --self-test.
// Without this, every verdict below is a statement about a driver that cannot
// tell a Python error from a successful render.
if (process.argv.includes('--self-test')) {
  let detected = false;
  try {
    runBlenderScript({
      blender: BLENDER,
      body: 'raise RuntimeError("deliberate self-test failure")',
      scriptPath: join(workDir, 'selftest.py'),
    });
  } catch (err) {
    detected = err instanceof BlenderRunError;
  }
  console.log(`[e2e] self-test: Blender failure detected = ${detected}`);
  process.exit(detected ? 0 : 1);
}
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node scripts/blender-bridge-e2e.mjs --self-test`
Expected: FAIL — `runBlenderScript is not defined`

- [ ] **Step 3: Wire the import and replace the direct invocation**

Add to the imports at the top of `scripts/blender-bridge-e2e.mjs`:

```js
import { runBlenderScript, BlenderRunError } from '../codex/core/blender-bridge/blender-run.js';
```

Then replace the existing `execSync` call that invokes Blender with:

```js
let blenderResult;
try {
  blenderResult = runBlenderScript({
    blender: BLENDER,
    body: blenderScriptBody,
    scriptPath: join(workDir, 'render.py'),
  });
} catch (err) {
  console.error('[e2e] Blender failed:');
  console.error(err.stderr || err.message);
  process.exit(1);
}
console.log(blenderResult.blenderLines.join('\n'));
```

Note: `blenderScriptBody` is the existing generated script **without** its own `import sys` preamble duplication — `wrapPythonBody` supplies `sys` and `traceback`. Leave the existing `sys.path.insert` line in the body; it is still needed.

- [ ] **Step 4: Verify**

```bash
node scripts/blender-bridge-e2e.mjs --self-test; echo "selftest exit=$?"
node scripts/blender-bridge-e2e.mjs; echo "e2e exit=$?"
```

Expected: `self-test: Blender failure detected = true`, `selftest exit=0`; then the normal run still reports `VERDICT: REPRODUCED`, `Matching blocks: 8/8`, `e2e exit=0`.

- [ ] **Step 5: Commit**

```bash
git add scripts/blender-bridge-e2e.mjs
git commit -m "fix(blender-bridge): route the E2E through a failing-capable runner

Adds --self-test, which asks Blender to raise and asserts the driver
notices. Falsifier 1 of the phase 0-2 plan: without it every verdict the
driver prints is a statement about a driver that cannot tell a Python
error from a successful render."
```

---

# PHASE 1 — COLOUR REACHES PIXELS

---

### Task 4: `color-law.js` — the transfer function, owned once

**Files:**
- Create: `codex/core/blender-bridge/color-law.js`
- Test: `tests/codex/core/blender-bridge/color-law.test.js`

**Interfaces:**
- Consumes: `SCALES`, `quantize` from `codex/core/blender-bridge/quantize.js`.
- Produces:
  - `srgbToLinear(c: number): number` — channel in [0,1] → linear.
  - `linearToSrgb(c: number): number` — inverse.
  - `hexIntToLinearTriple(hexInt: number): [number, number, number]`
  - `linearTripleToHexInt([r,g,b]: number[]): number`
  - `COLOR_LAW_EXACT: Readonly<{policy,transfer,viewTransform,look,samples}>`
  - `COLOR_LAW_TRANSFER = 'sRGB-IEC-61966-2-1'`

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/blender-bridge/color-law.test.js`:

```js
/**
 * The colour law is computed ONCE, JS-side, and shipped as declared numbers.
 * Both consumers (Blender and the Remotion canvas) apply the same values, which
 * is what lets COLOR_LAW agree across engines honestly rather than by accident.
 *
 * palette.py previously computed hex_to_linear consumer-side, contrary to the
 * bridge's rule that the addon applies values and reports what it applied.
 */
import { describe, it, expect } from 'vitest';
import {
  srgbToLinear,
  linearToSrgb,
  hexIntToLinearTriple,
  linearTripleToHexInt,
  COLOR_LAW_EXACT,
  COLOR_LAW_TRANSFER,
} from '../../../../codex/core/blender-bridge/color-law.js';

describe('srgbToLinear', () => {
  it('pins the endpoints', () => {
    expect(srgbToLinear(0)).toBe(0);
    expect(srgbToLinear(1)).toBeCloseTo(1, 12);
  });

  it('uses the linear segment below the 0.04045 knee', () => {
    expect(srgbToLinear(0.04)).toBeCloseTo(0.04 / 12.92, 12);
  });

  it('uses the power segment above the knee', () => {
    expect(srgbToLinear(0.5)).toBeCloseTo(((0.5 + 0.055) / 1.055) ** 2.4, 12);
  });
});

describe('linearToSrgb', () => {
  it('inverts srgbToLinear across the full 8-bit range', () => {
    // Every representable byte must survive the round trip, because the render
    // falsifier compares 8-bit values and a single off-by-one would fail it.
    for (let b = 0; b <= 255; b += 1) {
      const c = b / 255;
      const back = Math.round(linearToSrgb(srgbToLinear(c)) * 255);
      expect(back).toBe(b);
    }
  });
});

describe('hexIntToLinearTriple', () => {
  it('splits a packed hex int into three linear channels', () => {
    const [r, g, b] = hexIntToLinearTriple(0xDCB430);
    expect(r).toBeCloseTo(srgbToLinear(0xDC / 255), 12);
    expect(g).toBeCloseTo(srgbToLinear(0xB4 / 255), 12);
    expect(b).toBeCloseTo(srgbToLinear(0x30 / 255), 12);
  });

  it('maps black and white exactly', () => {
    expect(hexIntToLinearTriple(0x000000)).toEqual([0, 0, 0]);
    const [r, g, b] = hexIntToLinearTriple(0xFFFFFF);
    expect(r).toBeCloseTo(1, 12);
    expect(g).toBeCloseTo(1, 12);
    expect(b).toBeCloseTo(1, 12);
  });
});

describe('linearTripleToHexInt', () => {
  it('round-trips every specimen used by the render falsifier', () => {
    for (const hex of [0xDCB430, 0x4051B5, 0xFFFFFF, 0x000000, 0x7C3AED, 0x06B6D4]) {
      expect(linearTripleToHexInt(hexIntToLinearTriple(hex))).toBe(hex);
    }
  });
});

describe('COLOR_LAW_EXACT', () => {
  it('declares samples = 1 as part of the contract', () => {
    // Measured: 6/6 specimens byte-exact at 1 sample, 1/6 at 16, 0/6 at 64 with
    // a Gaussian filter. One sample per pixel has nothing to average, so the
    // filter only chooses where that sample lands. This is not a tuning knob.
    expect(COLOR_LAW_EXACT.samples).toBe(1);
  });

  it('declares the transfer function by name', () => {
    expect(COLOR_LAW_EXACT.transfer).toBe(COLOR_LAW_TRANSFER);
    expect(COLOR_LAW_TRANSFER).toBe('sRGB-IEC-61966-2-1');
  });

  it('pins the view transform and look', () => {
    expect(COLOR_LAW_EXACT.viewTransform).toBe('Standard');
    expect(COLOR_LAW_EXACT.look).toBe('None');
  });

  it('is frozen', () => {
    expect(Object.isFrozen(COLOR_LAW_EXACT)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/color-law.test.js`
Expected: FAIL — `Failed to resolve import ".../color-law.js"`

- [ ] **Step 3: Write the implementation**

Create `codex/core/blender-bridge/color-law.js`:

```js
/**
 * color-law — the sRGB transfer function, owned in exactly one place.
 *
 * Both consumers apply the SAME declared linear values: Blender through a
 * FLOAT_COLOR attribute, the Remotion canvas through its pixel buffer. That is
 * what allows the COLOR_LAW receipt slot to agree across engines honestly.
 *
 * The addon must never compute this. palette.py's hex_to_linear violated the
 * bridge's founding rule -- the consumer applies values and reports what it
 * applied -- and is deleted as part of this phase.
 *
 * samples = 1 is part of the EXACT contract, not a render preference. Measured
 * on Blender 5.2.0: 6/6 specimens round-trip byte-exactly at 1 sample, 1/6 at
 * 16, 0/6 at 64 with a Gaussian filter. With one sample per pixel there is
 * nothing to average, so the pixel filter only chooses where that sample lands
 * and sample 0 of a symmetric filter lands at the centre.
 */

export const COLOR_LAW_TRANSFER = 'sRGB-IEC-61966-2-1';

/** IEC 61966-2-1 knee points. Named so the branch is not a magic number. */
const SRGB_KNEE = 0.04045;
const LINEAR_KNEE = 0.0031308;
const SLOPE = 12.92;

export function srgbToLinear(c) {
  return c <= SRGB_KNEE ? c / SLOPE : ((c + 0.055) / 1.055) ** 2.4;
}

export function linearToSrgb(c) {
  if (c <= 0) return 0;
  return c <= LINEAR_KNEE ? c * SLOPE : 1.055 * c ** (1 / 2.4) - 0.055;
}

export function hexIntToLinearTriple(hexInt) {
  return [
    srgbToLinear(((hexInt >> 16) & 0xFF) / 255),
    srgbToLinear(((hexInt >> 8) & 0xFF) / 255),
    srgbToLinear((hexInt & 0xFF) / 255),
  ];
}

export function linearTripleToHexInt([r, g, b]) {
  const q = (c) => Math.min(255, Math.max(0, Math.round(linearToSrgb(c) * 255)));
  return (q(r) << 16) | (q(g) << 8) | q(b);
}

/**
 * The EXACT policy contract. Every field is a precondition of the byte-exact
 * round-trip falsifier; changing any of them invalidates it.
 */
export const COLOR_LAW_EXACT = Object.freeze({
  policy: 'EXACT',
  transfer: COLOR_LAW_TRANSFER,
  viewTransform: 'Standard',
  look: 'None',
  samples: 1,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/blender-bridge/color-law.test.js`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/color-law.js tests/codex/core/blender-bridge/color-law.test.js
git commit -m "feat(blender-bridge): own the sRGB transfer function in one place

Both consumers apply the same declared linear values, which is what lets
COLOR_LAW agree across engines honestly rather than by accident. The
round-trip is asserted over all 256 representable bytes, because the
render falsifier compares 8-bit values and one off-by-one would fail it.

COLOR_LAW_EXACT declares samples=1 as a contract term, not a preference:
measured 6/6 byte-exact at 1 sample, 1/6 at 16, 0/6 at 64 + Gaussian."
```

---

### Task 5: Carry declared linear colour on the wire

**Files:**
- Modify: `codex/core/blender-bridge/wire.js:103-133`
- Test: `tests/codex/core/blender-bridge/wire.test.js`

**Interfaces:**
- Consumes: `hexIntToLinearTriple`, `COLOR_LAW_EXACT`, `COLOR_LAW_TRANSFER` from Task 4; `quantize`, `SCALES` from `quantize.js`.
- Produces: `wire.colors.linear` (flat int32 array of length `3 * coordinateCount`, scale `SCALES.UNIT`), `wire.colorLaw` (the frozen descriptor), `wire.scales.pb_albedo = SCALES.UNIT`.

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/blender-bridge/wire.test.js`:

```js
describe('declared linear colour', () => {
  it('carries three linear channels per coordinate, flat and int32', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.colors.linear).toHaveLength(788 * 3);
    expect(Number.isInteger(w.colors.linear[0])).toBe(true);
  });

  it('quantizes linear colour at the UNIT scale', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.scales.pb_albedo).toBe(1e6);
  });

  it('matches the colour law applied to the packed hex, coordinate by coordinate', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    for (let i = 0; i < 20; i += 1) {
      const [r, g, b] = hexIntToLinearTriple(w.colors.color[i]);
      expect(w.colors.linear[i * 3 + 0]).toBe(Math.round(r * 1e6));
      expect(w.colors.linear[i * 3 + 1]).toBe(Math.round(g * 1e6));
      expect(w.colors.linear[i * 3 + 2]).toBe(Math.round(b * 1e6));
    }
  });

  it('retains the packed hex for provenance', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.colors.color).toHaveLength(788);
  });

  it('declares the colour law on the wire', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(w.colorLaw.transfer).toBe('sRGB-IEC-61966-2-1');
    expect(w.colorLaw.samples).toBe(1);
    expect(w.colorLaw.viewTransform).toBe('Standard');
  });

  it('still refuses nulls', () => {
    const w = toPythonWire(packet, { colorPolicy: 'EXACT' });
    expect(() => assertNoNulls(w)).not.toThrow();
  });
});
```

Add `hexIntToLinearTriple` to that file's imports:

```js
import { hexIntToLinearTriple } from '../../../../codex/core/blender-bridge/color-law.js';
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/blender-bridge/wire.test.js`
Expected: FAIL — `expected undefined to have length 2364`

- [ ] **Step 3: Implement**

In `codex/core/blender-bridge/wire.js`, add to the imports:

```js
import { hexIntToLinearTriple, COLOR_LAW_EXACT } from './color-law.js';
```

Then, immediately before the `const wire = {` literal, add:

```js
  // Declared linear colour. The consumer dequantizes and applies; it never runs
  // a transfer function of its own, so both engines shade from the same numbers.
  const linear = [];
  for (const c of coords) {
    const [lr, lg, lb] = hexIntToLinearTriple(hexToInt(c.color));
    linear.push(
      quantize(lr, SCALES.UNIT),
      quantize(lg, SCALES.UNIT),
      quantize(lb, SCALES.UNIT),
    );
  }
  scales.pb_albedo = SCALES.UNIT;
```

Then in the `colors` block of the wire literal, add the `linear` field:

```js
    colors: {
      color: coords.map((c) => hexToInt(c.color)),
      preSquareColor: coords.map((c) => hexToInt(c.preSquareColor)),
      linear,
    },
```

And add `colorLaw` as a sibling of `colorPolicy`:

```js
    colorLaw: COLOR_LAW_EXACT,
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/codex/core/blender-bridge/wire.test.js
npx vitest run tests/codex/core/blender-bridge/
```

Expected: both PASS. The second command guards against breaking `palette-wire`, `cross-engine`, `chained-receipt`, or the asset tests.

- [ ] **Step 5: Commit**

```bash
git add codex/core/blender-bridge/wire.js tests/codex/core/blender-bridge/wire.test.js
git commit -m "feat(blender-bridge): carry declared linear colour on the wire

colors.linear is a flat int32 array at the UNIT scale, computed once by
color-law.js. The packed hex stays for provenance. The consumer now has
values to apply rather than a transfer function to run."
```

---

### Task 6: Land colour as a `FLOAT_COLOR` attribute in Blender

**Files:**
- Modify: `blender/addons/scholomance_pixelbrain/ingest.py:36-91`
- Test: `blender/tests/test_ingest.py`

**Interfaces:**
- Consumes: `wire.colors.linear`, `wire.scales.pb_albedo` from Task 5.
- Produces: a `FLOAT_COLOR` attribute named `pb_albedo` on the POINT domain, consumed by Task 7.

- [ ] **Step 1: Write the failing test**

Append to `blender/tests/test_ingest.py`, following that file's existing `t_`/`check` convention:

```python
def t_albedo_attribute_is_float_color_on_point():
    obj = ingest_wire(_albedo_wire())
    attrs = obj.data.attributes
    assert "pb_albedo" in attrs, "pb_albedo attribute missing"
    assert attrs["pb_albedo"].data_type == "FLOAT_COLOR", attrs["pb_albedo"].data_type
    assert attrs["pb_albedo"].domain == "POINT", attrs["pb_albedo"].domain


def t_albedo_dequantizes_at_the_declared_scale():
    obj = ingest_wire(_albedo_wire())
    c = obj.data.attributes["pb_albedo"].data[0]
    # 715693 / 1e6 -- the linear value of 0xDC, carried as int32 by the wire.
    assert abs(c.color[0] - 0.715693) < 1e-6, c.color[0]
    assert abs(c.color[3] - 1.0) < 1e-6, "alpha must be opaque"


def t_packed_hex_still_crosses_for_provenance():
    obj = ingest_wire(_albedo_wire())
    assert "pb_color_color" in obj.data.attributes
```

And add this helper near the file's other wire builders:

```python
def _albedo_wire():
    """A two-point wire carrying declared linear colour for 0xDCB430."""
    return {
        "wireVersion": 1,
        "packetId": "ALBEDO-1",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": 8, "height": 8, "gridSize": 1},
        "coordinateCount": 2,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": {"x": [0, 1], "y": [0, 1], "z": [0, 0]},
        "colors": {
            "color": [0xDCB430, 0xDCB430],
            "preSquareColor": [0xDCB430, 0xDCB430],
            "linear": [715693, 456411, 29557, 715693, 456411, 29557],
        },
        "energy": {str(i): [0, 0] for i in range(8)},
        "sourceChecksum": "DEADBEEF",
        "absentId": -1,
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_ingest.py`
Expected: FAIL — `pb_albedo attribute missing`

- [ ] **Step 3: Implement**

In `blender/addons/scholomance_pixelbrain/ingest.py`, add after the `radius` block inside `ingest_wire`:

```python
    # Declared linear colour, dequantized at the scale the wire states. The
    # transfer function ran producer-side; this only divides. A FLOAT_COLOR
    # attribute is what ShaderNodeAttribute can read -- the packed int below
    # crosses for provenance and is not readable by a shader.
    linear = wire["colors"].get("linear")
    if linear:
        scale = float(wire["scales"]["pb_albedo"])
        albedo = pc.attributes.new(name="pb_albedo", type="FLOAT_COLOR", domain="POINT")
        rgba = []
        for i in range(count):
            rgba.extend(
                (
                    linear[i * 3 + 0] / scale,
                    linear[i * 3 + 1] / scale,
                    linear[i * 3 + 2] / scale,
                    1.0,
                )
            )
        albedo.data.foreach_set("color", rgba)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/blender-test.sh blender/tests/test_ingest.py
./scripts/blender-test.sh blender/tests/test_render_visibility.py
```

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/ingest.py blender/tests/test_ingest.py
git commit -m "feat(blender-ingest): land declared colour as a FLOAT_COLOR attribute

pb_albedo on the POINT domain is what ShaderNodeAttribute can actually
read; the packed pb_color_color int crosses for provenance and no shader
can consume it. Ingest only divides by the declared scale -- the transfer
function already ran producer-side."
```

---

### Task 7: Drive Emission from the albedo attribute

**Files:**
- Modify: `blender/addons/scholomance_pixelbrain/scene.py:48-69`
- Test: `blender/tests/test_color_roundtrip.py` (created here)

**Interfaces:**
- Consumes: the `pb_albedo` attribute from Task 6.
- Produces: `ensure_emission_material(pc)` now returns a material whose Emission Color is linked to `Attribute("pb_albedo")`. Task 9 extends the same material with Emission Strength.

This task carries **falsifier 2**, the byte-exact round-trip.

- [ ] **Step 1: Write the failing test**

Create `blender/tests/test_color_roundtrip.py`:

```python
"""
Falsifier 2: under EXACT policy at PHOTONIC = 0, the rendered pixel beneath a
coordinate equals that coordinate's authored hex byte-exactly.

This check has a demonstrated failure mode, which is why it is worth having:
measured on Blender 5.2.0, it returns 6/6 at samples=1, 1/6 at samples=16, and
0/6 at samples=64 with a Gaussian filter. With one sample per pixel there is
nothing to average, so the pixel filter only chooses where that sample lands.
samples=1 is therefore part of the EXACT contract, not a render preference.

Run via: ./scripts/blender-test.sh blender/tests/test_color_roundtrip.py
"""
import os
import sys
import tempfile

import numpy as np
import bpy

from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy,
    configure_deterministic_render,
    dump_pixels_f32,
)
from scholomance_pixelbrain.scene import prepare_render_scene

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


WORK = tempfile.mkdtemp(prefix="pb-roundtrip-")
W = H = 64

SPECIMENS = [
    (16, 16, 0xDCB430),
    (32, 16, 0x4051B5),
    (48, 16, 0xFFFFFF),
    (16, 48, 0x000000),
    (32, 48, 0x7C3AED),
    (48, 48, 0x06B6D4),
]


def _srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _linear_to_srgb(c):
    if c <= 0.0:
        return 0.0
    return c * 12.92 if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055


def _wire():
    """Specimens at pixel centres, with linear colour quantized as the wire does."""
    n = len(SPECIMENS)
    linear = []
    for (_x, _y, hexint) in SPECIMENS:
        for shift in (16, 8, 0):
            chan = ((hexint >> shift) & 0xFF) / 255.0
            linear.append(int(round(_srgb_to_linear(chan) * 1e6)))
    return {
        "wireVersion": 1,
        "packetId": "ROUNDTRIP-1",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": W, "height": H, "gridSize": 1},
        "coordinateCount": n,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": {
            "x": [s[0] for s in SPECIMENS],
            "y": [s[1] for s in SPECIMENS],
            "z": [0] * n,
        },
        "colors": {
            "color": [s[2] for s in SPECIMENS],
            "preSquareColor": [s[2] for s in SPECIMENS],
            "linear": linear,
        },
        "energy": {str(i): [0] * n for i in range(8)},
        "sourceChecksum": "ROUNDTRIP",
        "absentId": -1,
    }


def _render(samples):
    for obj in list(bpy.data.objects):
        if obj.type not in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    obj = ingest_wire(_wire())
    prepare_render_scene(obj, scene=scene)
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=samples, threads=8)
    path = dump_pixels_f32(os.path.join(WORK, f"rt_{samples}"))
    return np.fromfile(path, dtype=np.float32).reshape(H, W, 4)


def _exact_count(arr):
    hits = 0
    for (x, y, hexint) in SPECIMENS:
        px = arr[y, x]
        got = tuple(int(round(_linear_to_srgb(float(c)) * 255.0)) for c in px[:3])
        want = tuple((hexint >> s) & 0xFF for s in (16, 8, 0))
        if got == want:
            hits += 1
    return hits


def t_every_specimen_round_trips_byte_exactly():
    arr = _render(samples=1)
    hits = _exact_count(arr)
    assert hits == len(SPECIMENS), (
        f"only {hits}/{len(SPECIMENS)} specimens round-tripped; "
        "colour is not reaching pixels unchanged"
    )


def t_the_check_can_fail():
    # Guards against a vacuous falsifier. If 64 samples ALSO passes, the check is
    # not measuring what it claims and must not be trusted.
    hits = _exact_count(_render(samples=64))
    assert hits < len(SPECIMENS), (
        "64 samples round-tripped byte-exactly too -- this falsifier is vacuous"
    )


def t_exact_policy_forces_single_sample():
    scene = bpy.context.scene
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=64, threads=8)
    assert scene.cycles.samples == 1, (
        f"EXACT policy honoured a caller's samples={scene.cycles.samples}; "
        "the sample count is a contract term, not a preference"
    )


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_color_roundtrip.py`
Expected: FAIL — `only 0/6 specimens round-tripped` (the material is still constant white), and `EXACT policy honoured a caller's samples=64`.

- [ ] **Step 3: Implement**

In `blender/addons/scholomance_pixelbrain/scene.py`, replace the body of `ensure_emission_material`:

```python
def ensure_emission_material(pc):
    """
    Attach a deterministic emission material driven by the pb_albedo attribute.

    Emission rather than a lit BSDF because a light rig would make the pixel
    depend on the rig instead of on the coordinate. The Attribute node is what
    turns a crossed attribute into a shaded pixel -- without the link, 24 named
    attributes land on the POINT domain and every asset renders the same white.

    Idempotent: rebuilt from scratch each call, because a second
    bpy.data.materials.new() would collide-rename silently.
    """
    mat = bpy.data.materials.get(EMISSION_MATERIAL)
    if mat is None:
        mat = bpy.data.materials.new(EMISSION_MATERIAL)
    mat.use_nodes = True
    tree = mat.node_tree
    tree.nodes.clear()

    attr = tree.nodes.new("ShaderNodeAttribute")
    attr.attribute_type = "GEOMETRY"
    attr.attribute_name = ALBEDO_ATTRIBUTE

    emission = tree.nodes.new("ShaderNodeEmission")
    emission.inputs["Strength"].default_value = EMISSION_STRENGTH

    output = tree.nodes.new("ShaderNodeOutputMaterial")

    tree.links.new(attr.outputs["Color"], emission.inputs["Color"])
    tree.links.new(emission.outputs["Emission"], output.inputs["Surface"])

    if len(pc.materials) == 0:
        pc.materials.append(mat)
    else:
        pc.materials[0] = mat
    return mat
```

Add the constant near `EMISSION_MATERIAL`:

```python
ALBEDO_ATTRIBUTE = "pb_albedo"
```

Then in `blender/addons/scholomance_pixelbrain/render_claim.py`, change `configure_deterministic_render` so EXACT pins the sample count:

```python
def configure_deterministic_render(scene, seed, samples, threads=8):
    """
    Configure Cycles for bit-reproducible rendering.
    Only a CPU device exists on this machine (CUEW initialization failed).

    Under EXACT policy the sample count is NOT a caller preference. Byte-exact
    colour round-trip holds at 1 sample and fails at 16 and 64 -- with a single
    sample per pixel there is nothing to average, so the pixel filter only
    chooses where that sample lands. Honouring a caller's 64 here would silently
    void the colour law, so it is overridden rather than trusted.
    """
    scene.render.engine = "CYCLES"
    scene.cycles.device = "CPU"
    scene.cycles.seed = int(seed)
    scene.cycles.use_animated_seed = False
    if scene.view_settings.view_transform == "Standard" and scene.view_settings.look == "None":
        scene.cycles.samples = 1
    else:
        scene.cycles.samples = int(samples)
    scene.cycles.use_adaptive_sampling = False
    scene.cycles.use_denoising = False
    scene.render.threads_mode = "FIXED"
    scene.render.threads = int(threads)
    scene.render.image_settings.file_format = "OPEN_EXR"
    scene.render.image_settings.color_depth = "32"
    scene.render.image_settings.exr_codec = "NONE"
    return scene
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/blender-test.sh blender/tests/test_color_roundtrip.py
./scripts/blender-test.sh blender/tests/test_render_visibility.py
./scripts/blender-test.sh blender/tests/test_ingest.py
```

Expected: `test_color_roundtrip.py` PASS with `0 failure(s)` — including `the_check_can_fail`, which proves the falsifier is not vacuous. The other two still PASS.

Note: `test_render_visibility.py` passes `samples=16` but its assertions are about pixel *inequality*, which the sample override does not affect.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/scene.py blender/addons/scholomance_pixelbrain/render_claim.py blender/tests/test_color_roundtrip.py
git commit -m "feat(blender-scene): drive Emission from the albedo attribute

Falsifier 2 lands with it: under EXACT at PHOTONIC=0, the pixel beneath a
coordinate equals its authored hex byte-exactly. The suite asserts its own
non-vacuity -- 64 samples MUST fail the same check -- because a falsifier
that cannot fail is the pathology this bridge keeps reproducing.

EXACT now pins samples=1 instead of honouring a caller's value. Measured
6/6 exact at 1 sample, 1/6 at 16, 0/6 at 64 + Gaussian, so a caller
passing 64 would silently void the colour law."
```

---

### Task 8: Delete the unreachable palette path

**Files:**
- Modify: `blender/addons/scholomance_pixelbrain/palette.py:137-155` (delete `apply_palette_to_material`), `:26-38` (delete `hex_to_linear`)
- Modify: `blender/tests/test_palette.py`
- Modify: `scripts/blender-palette-e2e.mjs`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing. `create_palette_node_group(school, wire_palette=None)` keeps its signature and remains the palette's only entry point.

Per spec §4.1: once `pb_albedo` drives Emission.Color, a per-*asset* school accent has no declared binding saying what it should modulate, and inventing one is the SCR-017 violation this design refuses for the seven unbound energy types. The path is deleted rather than linked.

`test_palette.py` currently asserts `group node added to material` — that a node was *added*, never that it was *linked*. That assertion passing is why the E2E reported success for three schools at identical pixels.

- [ ] **Step 1: Write the failing test**

In `blender/tests/test_palette.py`, replace the three assertions under the `apply_palette_to_material:` heading with:

```python
print("[test_palette] palette has no route to pixels:")
_assert(
    not hasattr(palette, "apply_palette_to_material"),
    "apply_palette_to_material is deleted -- it built a node group and linked "
    "it to nothing, so three different schools rendered identical pixels",
)
_assert(
    not hasattr(palette, "hex_to_linear"),
    "hex_to_linear is deleted -- the consumer must not compute a transfer "
    "function; color-law.js owns it and the wire carries the result",
)
```

Use whatever the file's existing assertion helper is named; if it is inline `if/else` counting into `passed`/`failed`, follow that shape instead and keep the same two messages.

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_palette.py`
Expected: FAIL — the two new assertions fail because both functions still exist.

- [ ] **Step 3: Implement**

Delete `apply_palette_to_material` (the whole function) and `hex_to_linear` (the whole function) from `blender/addons/scholomance_pixelbrain/palette.py`.

Replace the `create_palette_node_group` fallback branch that called `hex_to_linear`, since the local hex constants can no longer be linearized consumer-side:

```python
        if wire_palette and role in wire_palette.get("channels", {}):
            # The only path. The integer is truth, the float is derived.
            ch = wire_palette["channels"][role]
            scale = wire_palette.get("scale", 1e6)
            linear = dequantize_color(ch["linear"], scale)
            rgb_node.outputs[0].default_value = (linear[0], linear[1], linear[2], 1.0)
        else:
            raise ValueError(
                f"no wire palette channel for role {role!r}. The consumer cannot "
                "derive one: the sRGB transfer function lives in color-law.js and "
                "its result must arrive on the wire."
            )
```

Update the `SCHOOL_PALETTE` docstring to record that the hex table is now reference data for the producer, not something this module converts.

In `scripts/blender-palette-e2e.mjs`, delete the `apply_palette_to_material(mat, school, palette_wire)` line from the generated Blender script and the render/hash comparison that followed it. Replace the E2E's claim with the crossing check from spec §4.1: build the node group for two different schools and assert their RGB values differ and match the wire.

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/blender-test.sh blender/tests/test_palette.py
npx vitest run tests/codex/core/blender-bridge/palette-wire.test.js tests/codex/core/blender-bridge/palette-e2e.test.js
node scripts/blender-palette-e2e.mjs output/holy_fire_claymore.pbrain ALCHEMY; echo "exit=$?"
```

Expected: all PASS. The E2E no longer claims a pixel result it cannot support.

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/palette.py blender/tests/test_palette.py scripts/blender-palette-e2e.mjs
git commit -m "refactor(blender-palette): delete the path that reached nothing

apply_palette_to_material built a node group and never linked it to the
material output, and prepare_render_scene would have clobbered it anyway.
Measured: ALCHEMY, VOID and WILL all rendered to pixel hash A4B6E16C and
the identical SCD64, while the suite asserted 'group node added to
material' -- that a node was added, never that it was linked.

Once pb_albedo drives Emission.Color there is no declared binding saying
what a per-asset school accent should modulate, and inventing one is the
SCR-017 violation refused for the seven unbound energy types. So the
palette's claim becomes the one it can support: it crosses correctly.

hex_to_linear goes with it -- the consumer must not own a transfer
function."
```

---

# PHASE 2 — ENERGY REACHES PIXELS

Only `PHOTONIC` (index 1) has a declared binding: grade **FA**, `shaderInput: 'Emission Strength'`, `transferFunction: 'linear'`. The other seven cross as raw attributes and stay that way. SCR-017 forbids inventing bindings to fill out the table.

---

### Task 9: Bind PHOTONIC energy to Emission Strength

**Files:**
- Modify: `blender/addons/scholomance_pixelbrain/ingest.py`
- Modify: `blender/addons/scholomance_pixelbrain/scene.py`
- Test: `blender/tests/test_energy_binding.py` (created here)

**Interfaces:**
- Consumes: `wire.energy["1"]` (int32 at `SCALES.UNIT`), the material built in Task 7.
- Produces: a `FLOAT` attribute `pb_photonic` on the POINT domain, linked to `Emission.Strength`.

- [ ] **Step 1: Write the failing test**

Create `blender/tests/test_energy_binding.py`:

```python
"""
Falsifier 5: a PHOTONIC-energised asset must not render identically to the same
asset with PHOTONIC = 0.

Only PHOTONIC has a declared binding (grade FA, Emission Strength, linear
transfer). The other seven energy types cross as raw attributes and MUST NOT be
wired -- SCR-017 forbids implicit bindings, and a binding invented to fill out
the table is indistinguishable from one that was measured.

Run via: ./scripts/blender-test.sh blender/tests/test_energy_binding.py
"""
import os
import sys
import tempfile

import numpy as np
import bpy

from scholomance_pixelbrain.ingest import ingest_wire
from scholomance_pixelbrain.render_claim import (
    apply_color_policy,
    configure_deterministic_render,
    dump_pixels_f32,
)
from scholomance_pixelbrain.scene import prepare_render_scene

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


WORK = tempfile.mkdtemp(prefix="pb-energy-")
W = H = 32
N = 4
POSITIONS = {"x": [8, 12, 16, 20], "y": [16, 16, 16, 16], "z": [0, 0, 0, 0]}
# 0x808080 -- a mid grey, so a strength change moves it in both directions.
LINEAR = [216030, 216030, 216030] * N


def _wire(photonic_q, energy_index="1"):
    energy = {str(i): [0] * N for i in range(8)}
    energy[energy_index] = [photonic_q] * N
    return {
        "wireVersion": 1,
        "packetId": f"ENERGY-{energy_index}-{photonic_q}",
        "kind": "test",
        "colorPolicy": "EXACT",
        "canvas": {"width": W, "height": H, "gridSize": 1},
        "coordinateCount": N,
        "scales": {"pb_albedo": 1000000},
        "intern": {},
        "attributes": {},
        "positions": POSITIONS,
        "colors": {
            "color": [0x808080] * N,
            "preSquareColor": [0x808080] * N,
            "linear": LINEAR,
        },
        "energy": energy,
        "sourceChecksum": "ENERGY",
        "absentId": -1,
    }


def _render(wire, tag):
    for obj in list(bpy.data.objects):
        if obj.type not in {"CAMERA", "LIGHT"}:
            bpy.data.objects.remove(obj, do_unlink=True)
    scene = bpy.context.scene
    obj = ingest_wire(wire)
    prepare_render_scene(obj, scene=scene)
    scene.render.resolution_x = W
    scene.render.resolution_y = H
    scene.render.film_transparent = True
    apply_color_policy(scene, "EXACT")
    configure_deterministic_render(scene, seed=0, samples=1, threads=8)
    path = dump_pixels_f32(os.path.join(WORK, tag))
    return np.fromfile(path, dtype=np.float32).reshape(H, W, 4)


def t_photonic_attribute_lands_as_float():
    obj = ingest_wire(_wire(500000))
    attrs = obj.data.attributes
    assert "pb_photonic" in attrs, "pb_photonic attribute missing"
    assert attrs["pb_photonic"].data_type == "FLOAT", attrs["pb_photonic"].data_type
    assert abs(attrs["pb_photonic"].data[0].value - 0.5) < 1e-6


def t_photonic_energy_changes_pixels():
    dark = _render(_wire(0), "photonic_0")
    bright = _render(_wire(1000000), "photonic_1")
    assert not np.array_equal(dark, bright), (
        "PHOTONIC 0.0 and 1.0 rendered identical pixels -- "
        "the declared binding does not reach the shader"
    )


def t_photonic_scales_emission_upward():
    lo = _render(_wire(250000), "photonic_lo")
    hi = _render(_wire(1000000), "photonic_hi")
    assert hi[16, 8][0] > lo[16, 8][0], (
        f"higher PHOTONIC did not brighten the pixel: "
        f"{hi[16, 8][0]} <= {lo[16, 8][0]}"
    )


def t_undeclared_energy_types_do_not_reach_pixels():
    # SCR-017. THERMAL (index 3) has no declared binding. If changing it moves a
    # pixel, something wired it implicitly and the registry is now a fiction.
    a = _render(_wire(0, energy_index="3"), "thermal_0")
    b = _render(_wire(1000000, energy_index="3"), "thermal_1")
    assert np.array_equal(a, b), (
        "THERMAL energy changed the render, but it has no declared binding"
    )


for n, f in list(globals().items()):
    if n.startswith("t_"):
        check(n[2:], f)

print(f"\n{len(FAILURES)} failure(s)")
sys.exit(1 if FAILURES else 0)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./scripts/blender-test.sh blender/tests/test_energy_binding.py`
Expected: FAIL — `pb_photonic attribute missing`, and `PHOTONIC 0.0 and 1.0 rendered identical pixels`.

- [ ] **Step 3: Implement**

In `blender/addons/scholomance_pixelbrain/ingest.py`, add after the `pb_albedo` block:

```python
    # PHOTONIC (index 1) is the only energy type with a declared binding:
    # grade FA, Emission Strength, linear transfer. It lands as FLOAT because
    # ShaderNodeAttribute cannot drive a float input from an INT attribute.
    # The other seven cross as raw ints above and MUST NOT be wired -- an
    # invented binding is indistinguishable from a measured one.
    photonic = wire["energy"].get(PHOTONIC_CHANNEL)
    if photonic:
        attr = pc.attributes.new(name=PHOTONIC_ATTRIBUTE, type="FLOAT", domain="POINT")
        attr.data.foreach_set("value", [v / UNIT_SCALE for v in photonic])
```

Add near the other module constants in `ingest.py`:

```python
# The declared PHOTONIC binding. See codex/core/blender-bridge/energy-bindings.js.
PHOTONIC_CHANNEL = "1"
PHOTONIC_ATTRIBUTE = "pb_photonic"
UNIT_SCALE = 1000000.0
```

In `blender/addons/scholomance_pixelbrain/scene.py`, add the constant:

```python
PHOTONIC_ATTRIBUTE = "pb_photonic"
```

and inside `ensure_emission_material`, after the existing albedo link, add:

```python
    # Declared binding: PHOTONIC -> Emission Strength, grade FA, linear transfer.
    # Added additively to the base strength so a zero-energy asset renders at
    # exactly EMISSION_STRENGTH and the byte-exact colour law still holds there.
    energy_attr = tree.nodes.new("ShaderNodeAttribute")
    energy_attr.attribute_type = "GEOMETRY"
    energy_attr.attribute_name = PHOTONIC_ATTRIBUTE

    add_strength = tree.nodes.new("ShaderNodeMath")
    add_strength.operation = "ADD"
    add_strength.inputs[1].default_value = EMISSION_STRENGTH

    tree.links.new(energy_attr.outputs["Factor"], add_strength.inputs[0])
    tree.links.new(add_strength.outputs["Value"], emission.inputs["Strength"])
```

- [ ] **Step 4: Run test to verify it passes**

```bash
./scripts/blender-test.sh blender/tests/test_energy_binding.py
./scripts/blender-test.sh blender/tests/test_color_roundtrip.py
./scripts/blender-test.sh blender/tests/test_render_visibility.py
```

Expected: all PASS. `test_color_roundtrip.py` must still pass — its specimens carry `PHOTONIC = 0`, which is exactly the scope the colour law declares (spec §2.3).

- [ ] **Step 5: Commit**

```bash
git add blender/addons/scholomance_pixelbrain/ingest.py blender/addons/scholomance_pixelbrain/scene.py blender/tests/test_energy_binding.py
git commit -m "feat(blender-scene): bind PHOTONIC energy to Emission Strength

The one binding the registry declares -- grade FA, linear transfer. It
lands as FLOAT because ShaderNodeAttribute cannot drive a float input from
an INT attribute, and it is added to the base strength so a zero-energy
asset still renders at exactly EMISSION_STRENGTH and the byte-exact colour
law holds in its declared PHOTONIC=0 scope.

The suite also asserts the NEGATIVE: THERMAL has no declared binding, so
changing it must not move a pixel. Without that, an implicit wire-up would
make the registry a fiction and nothing would catch it."
```

---

### Task 10: Re-measure the carried falsifiers and record the phase result

**Files:**
- Modify: `docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md` (§5 table)

**Interfaces:**
- Consumes: everything above.
- Produces: nothing consumed by later tasks.

Spec §5 marks falsifiers 3 and 5 "carried, not re-run" from an earlier session. They must be measured now rather than assumed, and the table updated with what is actually true.

- [ ] **Step 1: Re-measure falsifier 3 (colour reaches pixels)**

```bash
node scripts/blender-bridge-e2e.mjs output/holy_fire_claymore.pbrain 2>&1 | grep -E 'Render 1 hash|VERDICT'
node scripts/blender-bridge-e2e.mjs tests/fixtures/multi-energy-asset.pbrain 2>&1 | grep -E 'Render 1 hash|VERDICT'
```

Expected: two **different** `Render 1 hash` values, each `VERDICT: REPRODUCED`. Record both hashes.

- [ ] **Step 2: Re-run the full Blender suite**

```bash
for t in blender/tests/*.py; do ./scripts/blender-test.sh "$t" >/dev/null 2>&1 && echo "PASS $t" || echo "FAIL $t"; done
```

Expected: all PASS except `test_sim_scene.py`, which fails on `steps_per_second` — Phase 3 work, not a regression from this plan.

- [ ] **Step 3: Re-run the full JS suite for the bridge**

```bash
npx vitest run tests/codex/core/blender-bridge/
```

Expected: PASS.

- [ ] **Step 4: Update the spec's falsifier table**

Edit §5 of `docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md`. For rows 1–5, replace the "Today" and "Source" cells with the measured post-implementation result and `measured <date>, phases 0-2`. Leave rows 6–10 unchanged; they are Phase 3+ work.

If any row did **not** turn green, record it as still red with its measurement. Do not mark a row green you did not observe.

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-07-30-blender-bridge-fully-functional-design.md
git commit -m "docs: record the measured result of blender bridge phases 0-2

Falsifiers 3 and 5 were carried from an earlier session and marked
not-re-run. They are measured here rather than assumed, and the table
carries what was observed."
```

---

## Self-Review

**Spec coverage.** §1.1 driver honesty → Tasks 1–3. §2 colour law → Task 4. §3.1 wire → Task 5. §3.1 ingest → Task 6. §3.1 scene + `render_claim` → Task 7. §4.1 palette deletion → Task 8. Phase 2 / §2.3 PHOTONIC scope → Task 9. §5 carried falsifiers → Task 10.

**Deliberately out of scope for this plan:** §1.4 `COLOR_LAW` slot contents, §1.5 the `cross-engine.js:86` verdict collapse, §1.3 `substeps_per_frame`, §1.6 `formatForWire`, and the carrier. Those are Phases 3–6 and will be planned once colour is landing on pixels.

**Type consistency.** `pb_albedo` is `FLOAT_COLOR` in Tasks 5, 6, 7 and named by `ALBEDO_ATTRIBUTE` in `scene.py`. `pb_photonic` is `FLOAT` in Task 9, named by `PHOTONIC_ATTRIBUTE` in both `ingest.py` and `scene.py`. `wire.colors.linear` is a flat int32 array of length `3n` in Tasks 5, 6, 7, 9. `COLOR_LAW_EXACT.samples` is `1` in Tasks 4 and 7. `runBlenderScript` returns `{ stdout, blenderLines }` in Tasks 1 and 3.

**Socket names, enumerated on Blender 5.2.0 rather than recalled.** The first draft of Task 9 said `Fac`, which is wrong — it is `Factor`. Verified live:

| node | sockets |
|---|---|
| `ShaderNodeAttribute` outputs | `Color`, `Vector`, `Factor`, `Alpha` |
| `ShaderNodeEmission` inputs | `Color`, `Strength`, `Weight` |
| `ShaderNodeEmission` outputs | `Emission` |
| `ShaderNodeMath` outputs | `Value` |

Use these names exactly. A wrong socket name raises at material build time, which Task 2's harness fix now surfaces as a real FAIL rather than a PASS.

**One deprecation to expect, not to fix.** Blender 5.2 warns `'Material.use_nodes' is expected to be removed in Blender 6.0`. It is a warning, the existing addon already relies on it, and changing the material API is not this plan's scope. Leave it.
