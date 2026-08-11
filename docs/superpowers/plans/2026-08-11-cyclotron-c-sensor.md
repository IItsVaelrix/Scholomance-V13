# Cyclotron C-Sensor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a sensor that detects when the Semantic Valence Cyclotron's own behaviour changes — identical inputs must produce identical outputs, and any difference is code drift.

**Architecture:** A pure core module (`codex/core/pixelbrain/cyclotron-sensor.js`) turns a cyclotron report into a sealed *receipt* carrying an input fingerprint and an output fingerprint, and compares a receipt against an approved baseline. A thin shell script (`scripts/cyclotron-sensor.mjs`) does the file I/O, maintains the ledger, and sets the exit code. The sensor never runs the cyclotron and never auto-heals; it reports and refuses.

**Tech Stack:** Node ESM, Vitest, `sha256Hex`/`stableStringify` from `codex/core/immunity/cleri-probe/canonical-report.js`.

**Spec:** `docs/superpowers/specs/2026-08-11-cyclotron-c-sensor-design.md`

## Global Constraints

- Sensor contract string is exactly `PB-CYCLOTRON-SENSOR-v1`; ledger contract is exactly `PB-CYCLOTRON-SENSOR-LEDGER-v1`. Both carry `schemaVersion` `'1.0.0'`.
- Seal prefixes are exactly `cyclosensor1:` for receipts and `cyclosensor-ledger1:` for the ledger.
- The core module performs **no** file I/O, reads **no** clock, and uses **no** randomness. Every core function is deterministic.
- Seals are computed as `sha256Hex(bodyWithoutChecksum)` using `sha256Hex` from `codex/core/immunity/cleri-probe/canonical-report.js`, which hashes `JSON.stringify(sortKeys(value))`. This exact form is required so `scripts/evidence-integrity-harness.mjs` can verify the artifacts.
- `assess()` must never mutate its `baseline` argument.
- Baselines are written only by an explicit `--approve --reason=…`. Nothing else may create or update a baseline.
- Exit codes: `0` for `STABLE` / `ABSTAIN` / `NO_BASELINE`, `1` for `DEVIATION`, `2` for any refusal or hard error.
- Test files live under `tests/codex/core/pixelbrain/` and run with `npx vitest run <path>`.
- Do not use `git stash` to compare code states anywhere in this plan; the working tree is always dirty. Use a git worktree.

---

### Task 1: Receipt construction — `buildReceipt`

**Files:**
- Create: `codex/core/pixelbrain/cyclotron-sensor.js`
- Test: `tests/codex/core/pixelbrain/cyclotron-sensor.test.js`

**Interfaces:**
- Consumes: `sha256Hex`, `stableStringify` from `codex/core/immunity/cleri-probe/canonical-report.js`
- Produces: `CYCLOTRON_SENSOR_CONTRACT` (string), `CYCLOTRON_SENSOR_SCHEMA_VERSION` (string), `buildReceipt(report) -> { contract, schemaVersion, inputClass, inputs, outputs }`. `inputs` and `outputs` are flat objects whose keys later tasks enumerate with `Object.keys`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/cyclotron-sensor.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  CYCLOTRON_SENSOR_CONTRACT,
  buildReceipt,
} from '../../../../codex/core/pixelbrain/cyclotron-sensor.js';

const candidate = (atomIds, finalScore, energy, novelty, grounding, feasibility) => ({
  finalScore,
  molecule: { atomIds, energy, novelty, grounding, checksum: `molecule1:${atomIds.join('')}` },
  conceptChemistry: { feasibility },
  verdict: 'HYPOTHESIS',
});

export const makeReport = (overrides = {}) => ({
  contract: 'PB-SEMANTIC-CYCLOTRON-REPORT-v1',
  schemaVersion: '1.0.0',
  seed: 6045712,
  requestedTrials: 2000,
  completedTrials: 2000,
  atomBankChecksum: 'atombank1:fdb594f75fae202a',
  groundingIndexChecksum: 'grnd1:37c87b90a96e27a7',
  chemistryProvenance: {
    schema: 'PB-CONCEPT-CHEM-v1',
    version: 'v2',
    weights: { bond: 0.1, grounding: 0.3, coherence: 0.15, relation: 0.45 },
  },
  configuration: { maxMoleculeSize: 5, shortlistLimit: 256, shortlistFamilyCap: 2 },
  control: { bar: 0.201721, percentile: 0.99, samples: 400 },
  counts: {
    candidateTrials: 1600, controlTrials: 400, duplicateMolecules: 5, hypotheses: 3,
    nuclei: 1, refused: 2, shortlisted: 4, uniqueMolecules: 10, unboundTrials: 0,
  },
  candidates: [
    candidate(['bytecode-seal', 'canonical-serializer'], 0.7725, 0.7627, 0.3191, 0.7096, 0.6105),
    candidate(['immutable-packet', 'schema-verifier'], 0.7681, 0.7601, 0.3242, 0.7011, 0.6002),
  ],
  checksum: 'cyclotron1:aaaabbbbccccddddeeeeffff00001111',
  ...overrides,
});

describe('buildReceipt', () => {
  it('stamps the sensor contract and derives an input class', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.contract).toBe(CYCLOTRON_SENSOR_CONTRACT);
    expect(receipt.schemaVersion).toBe('1.0.0');
    expect(receipt.inputClass).toMatch(/^inclass1:[0-9a-f]{64}$/);
  });

  it('is deterministic — the same report yields an identical receipt', () => {
    expect(buildReceipt(makeReport())).toEqual(buildReceipt(makeReport()));
  });

  it('carries provenance read from inside the report, not recomputed', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.inputs.chemistryVersion).toBe('v2');
    expect(receipt.inputs.chemistryWeights).toEqual({
      bond: 0.1, grounding: 0.3, coherence: 0.15, relation: 0.45,
    });
  });

  it('fingerprints outputs including every count and a shortlist digest', () => {
    const receipt = buildReceipt(makeReport());
    expect(receipt.outputs.reportChecksum).toBe('cyclotron1:aaaabbbbccccddddeeeeffff00001111');
    expect(receipt.outputs.controlBar).toBe(0.201721);
    expect(receipt.outputs['count.nuclei']).toBe(1);
    expect(receipt.outputs['count.uniqueMolecules']).toBe(10);
    expect(receipt.outputs.shortlistDigest).toMatch(/^shortlist1:[0-9a-f]{64}$/);
    expect(receipt.outputs.meanFinalScore).toBe(0.7703);
  });

  it('refuses a report with no chemistry provenance', () => {
    const report = makeReport();
    delete report.chemistryProvenance;
    expect(() => buildReceipt(report)).toThrow(/NO_CHEMISTRY_PROVENANCE/);
  });

  it('refuses a report with no atom bank checksum', () => {
    expect(() => buildReceipt(makeReport({ atomBankChecksum: null })))
      .toThrow(/atomBankChecksum/);
  });

  it('orders the shortlist digest by content, not by candidate order', () => {
    const a = buildReceipt(makeReport());
    const flipped = makeReport();
    flipped.candidates = [...flipped.candidates].reverse();
    const b = buildReceipt(flipped);
    expect(b.outputs.shortlistDigest).toBe(a.outputs.shortlistDigest);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js`
Expected: FAIL — cannot resolve `codex/core/pixelbrain/cyclotron-sensor.js`.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/cyclotron-sensor.js`:

```js
/**
 * CYCLOTRON C-SENSOR — the reactor audits itself.
 *
 * Built from nucleus composition C, proposed by the Semantic Valence Cyclotron:
 *
 *   cyclotron-reactor    --experiment-receipt--> evidence-ledger
 *   evidence-ledger      --structure----------> canonical-serializer
 *   canonical-serializer --artifact-----------> bytecode-seal
 *   canonical-serializer --artifact-----------> schema-verifier
 *
 * C is the only one of the three emitted compositions that closes its own input:
 * evidence-ledger is the sole atom offering the `structure` that canonical-serializer
 * seeks. Its dangling `validation-verdict` port is where baseline approval enters.
 *
 * WHY IT EXISTS: evidence-integrity-harness.mjs (composition A2) audits artifacts at
 * rest — it detects that a file changed. It cannot detect that the REACTOR changed
 * while its outputs were rewritten legitimately. On 2026-08-11 a scoring change
 * silently altered every downstream benchmark number and was caught by hand.
 *
 * Sensors, then immune response — in that order (PDR §4.5). This module reports and
 * refuses. It never heals, and it never promotes its own baseline.
 *
 * Pure: no file I/O, no clock, no randomness.
 */

import { sha256Hex, stableStringify } from '../immunity/cleri-probe/canonical-report.js';

export const CYCLOTRON_SENSOR_CONTRACT = 'PB-CYCLOTRON-SENSOR-v1';
export const CYCLOTRON_SENSOR_SCHEMA_VERSION = '1.0.0';

const round12 = (value) => Number(Number(value).toFixed(12));

const mean = (values) => (values.length
  ? values.reduce((sum, value) => sum + value, 0) / values.length
  : 0);

function fail(code, message) {
  throw new TypeError(`${CYCLOTRON_SENSOR_CONTRACT}: ${code} — ${message}`);
}

function required(value, field) {
  if (value === undefined || value === null || value === '') {
    fail('INCOMPLETE_REPORT', `report is missing required field "${field}"`);
  }
  return value;
}

// ── [RX] cyclotron-reactor (offers: experiment-receipt) ────────────────────
// seeks candidate-frontier + feasibility-score, both supplied by the real run
// and carried inside the report.
export function buildReceipt(report) {
  if (!report || typeof report !== 'object' || Array.isArray(report)) {
    fail('INCOMPLETE_REPORT', 'report must be an object');
  }
  const provenance = report.chemistryProvenance;
  if (!provenance || typeof provenance !== 'object') {
    fail('NO_CHEMISTRY_PROVENANCE',
      'report carries no chemistryProvenance; it predates the stamp and cannot be assessed');
  }
  const candidates = Array.isArray(report.candidates) ? report.candidates : [];

  const inputs = {
    reportContract: required(report.contract, 'contract'),
    reportSchemaVersion: required(report.schemaVersion, 'schemaVersion'),
    atomBankChecksum: required(report.atomBankChecksum, 'atomBankChecksum'),
    groundingIndexChecksum: required(report.groundingIndexChecksum, 'groundingIndexChecksum'),
    chemistryVersion: required(provenance.version, 'chemistryProvenance.version'),
    chemistryWeights: required(provenance.weights, 'chemistryProvenance.weights'),
    configuration: required(report.configuration, 'configuration'),
    seed: required(report.seed, 'seed'),
    requestedTrials: required(report.requestedTrials, 'requestedTrials'),
  };

  const shortlist = candidates
    .map((row) => [[...(row.molecule?.atomIds ?? [])].sort(), round12(row.finalScore ?? 0)])
    .sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));

  const outputs = {
    reportChecksum: required(report.checksum, 'checksum'),
    controlBar: round12(report.control?.bar ?? 0),
    meanFinalScore: round12(mean(candidates.map((row) => row.finalScore ?? 0))),
    meanEnergy: round12(mean(candidates.map((row) => row.molecule?.energy ?? 0))),
    meanNovelty: round12(mean(candidates.map((row) => row.molecule?.novelty ?? 0))),
    meanGrounding: round12(mean(candidates.map((row) => row.molecule?.grounding ?? 0))),
    meanChemistryFeasibility: round12(
      mean(candidates.map((row) => row.conceptChemistry?.feasibility ?? 0)),
    ),
    shortlistDigest: `shortlist1:${sha256Hex(shortlist)}`,
  };
  for (const [name, value] of Object.entries(required(report.counts, 'counts'))) {
    outputs[`count.${name}`] = value;
  }

  return {
    contract: CYCLOTRON_SENSOR_CONTRACT,
    schemaVersion: CYCLOTRON_SENSOR_SCHEMA_VERSION,
    inputClass: `inclass1:${sha256Hex(inputs)}`,
    inputs,
    outputs,
  };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js`
Expected: PASS, 7 tests.

If `meanFinalScore` fails on the exact value, the fixture arithmetic is `(0.7725 + 0.7681) / 2 = 0.7703`. Fix the fixture, never the rounding.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/cyclotron-sensor.js tests/codex/core/pixelbrain/cyclotron-sensor.test.js
git commit -m "feat(cyclotron-sensor): receipt construction — input class and output fingerprint"
```

---

### Task 2: The verdict — `assess`

**Files:**
- Modify: `codex/core/pixelbrain/cyclotron-sensor.js`
- Test: `tests/codex/core/pixelbrain/cyclotron-sensor.test.js`

**Interfaces:**
- Consumes: `buildReceipt(report)` from Task 1.
- Produces: `assess(receipt, baseline) -> { verdict, inputClass, reason, differing, moved }` where `verdict` is one of `'NO_BASELINE' | 'ABSTAIN' | 'STABLE' | 'DEVIATION'`, `differing` is an array of input field names, and `moved` is an array of `{ field, baseline, observed }`.

The two parameterized tests below are the point of this task: they enumerate the receipt's own fields, so a fingerprint field that cannot change the verdict fails the suite instead of sitting there looking like evidence.

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/pixelbrain/cyclotron-sensor.test.js` (and add `assess` to the import at the top of the file):

```js
describe('assess', () => {
  const baselineOf = (report = makeReport()) => buildReceipt(report);

  it('returns NO_BASELINE when nothing has been approved', () => {
    const reading = assess(baselineOf(), null);
    expect(reading.verdict).toBe('NO_BASELINE');
    expect(reading.moved).toEqual([]);
  });

  it('returns STABLE when inputs and outputs both match', () => {
    const reading = assess(baselineOf(), baselineOf());
    expect(reading.verdict).toBe('STABLE');
    expect(reading.moved).toEqual([]);
  });

  it('ABSTAINs when the sensor contract itself changed', () => {
    const baseline = { ...baselineOf(), contract: 'PB-CYCLOTRON-SENSOR-v0' };
    const reading = assess(baselineOf(), baseline);
    expect(reading.verdict).toBe('ABSTAIN');
    expect(reading.reason).toBe('SENSOR_CONTRACT_CHANGED');
  });

  it('never mutates the baseline', () => {
    const baseline = baselineOf();
    const before = JSON.stringify(baseline);
    assess(buildReceipt(makeReport({ checksum: 'cyclotron1:different' })), baseline);
    expect(JSON.stringify(baseline)).toBe(before);
  });

  // Every OUTPUT field must be able to produce a DEVIATION. A field that cannot
  // move the verdict is not evidence — it is decoration, and this test deletes it.
  const outputFields = Object.keys(buildReceipt(makeReport()).outputs);
  it.each(outputFields)('DEVIATION fires and names the moved output field: %s', (field) => {
    const baseline = baselineOf();
    const observed = baselineOf();
    observed.outputs[field] = typeof observed.outputs[field] === 'number'
      ? observed.outputs[field] + 1
      : `${observed.outputs[field]}-perturbed`;
    const reading = assess(observed, baseline);
    expect(reading.verdict).toBe('DEVIATION');
    expect(reading.moved.map((m) => m.field)).toContain(field);
  });

  // Every INPUT field must be able to produce an ABSTAIN — and must never
  // produce a DEVIATION. Changing an input is not evidence of drift.
  const inputFields = Object.keys(buildReceipt(makeReport()).inputs);
  it.each(inputFields)('ABSTAIN fires and names the changed input field: %s', (field) => {
    const baseline = baselineOf();
    const observed = baselineOf();
    observed.inputs[field] = typeof observed.inputs[field] === 'number'
      ? observed.inputs[field] + 1
      : `${JSON.stringify(observed.inputs[field])}-perturbed`;
    observed.inputClass = 'inclass1:recomputed-elsewhere';
    const reading = assess(observed, baseline);
    expect(reading.verdict).toBe('ABSTAIN');
    expect(reading.reason).toBe('INPUT_CLASS_CHANGED');
    expect(reading.differing).toContain(field);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js -t assess`
Expected: FAIL — `assess is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `codex/core/pixelbrain/cyclotron-sensor.js`:

```js
// ── [LEDGER] evidence-ledger (offers: structure) ──────────────────────────
// seeks experiment-receipt + validation-verdict. The validation-verdict port is
// the baseline's approval: an unapproved class yields NO_BASELINE, never a verdict.
export function assess(receipt, baseline) {
  const base = {
    verdict: 'NO_BASELINE',
    inputClass: receipt.inputClass,
    reason: null,
    differing: [],
    moved: [],
  };
  if (!baseline) return base;

  if (baseline.contract !== receipt.contract
    || baseline.schemaVersion !== receipt.schemaVersion) {
    return { ...base, verdict: 'ABSTAIN', reason: 'SENSOR_CONTRACT_CHANGED' };
  }

  if (baseline.inputClass !== receipt.inputClass) {
    const names = new Set([
      ...Object.keys(receipt.inputs ?? {}),
      ...Object.keys(baseline.inputs ?? {}),
    ]);
    const differing = [...names].sort().filter(
      (name) => stableStringify(receipt.inputs?.[name]) !== stableStringify(baseline.inputs?.[name]),
    );
    return { ...base, verdict: 'ABSTAIN', reason: 'INPUT_CLASS_CHANGED', differing };
  }

  const names = new Set([
    ...Object.keys(receipt.outputs ?? {}),
    ...Object.keys(baseline.outputs ?? {}),
  ]);
  const moved = [];
  for (const name of [...names].sort()) {
    const observed = receipt.outputs?.[name];
    const expected = baseline.outputs?.[name];
    if (stableStringify(observed) !== stableStringify(expected)) {
      moved.push({ field: name, baseline: expected ?? null, observed: observed ?? null });
    }
  }
  return moved.length === 0
    ? { ...base, verdict: 'STABLE' }
    : { ...base, verdict: 'DEVIATION', moved };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js`
Expected: PASS. The two `it.each` blocks expand to one test per fingerprint field — at least 9 input cases and at least 17 output cases.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/cyclotron-sensor.js tests/codex/core/pixelbrain/cyclotron-sensor.test.js
git commit -m "feat(cyclotron-sensor): four verdicts, with every fingerprint field proven able to fire"
```

---

### Task 3: The seal — `sealReceipt`, verifiable by the A2 harness

**Files:**
- Modify: `codex/core/pixelbrain/cyclotron-sensor.js`
- Test: `tests/codex/core/pixelbrain/cyclotron-sensor.test.js`

**Interfaces:**
- Produces: `sealReceipt(receipt) -> { artifact, checksum }` where `artifact` is the canonical JSON text and `checksum` is `` `cyclosensor1:${sha256Hex(bodyWithoutChecksum)}` ``.

- [ ] **Step 1: Write the failing test**

Append to the test file (add `sealReceipt` to the import, and add `import { sha256Hex } from '../../../../codex/core/immunity/cleri-probe/canonical-report.js';`):

```js
describe('sealReceipt', () => {
  it('seals with the prefix and a sha256 of the body', () => {
    const { artifact, checksum } = sealReceipt(buildReceipt(makeReport()));
    expect(checksum).toMatch(/^cyclosensor1:[0-9a-f]{64}$/);
    expect(typeof artifact).toBe('string');
  });

  it('is verifiable by the exact rule evidence-integrity-harness.mjs applies', () => {
    const receipt = buildReceipt(makeReport());
    const { checksum } = sealReceipt(receipt);
    // Reproduce the harness: strip `checksum`, recompute sha256Hex over the body,
    // compare against the claimed suffix.
    const stored = { ...receipt, checksum };
    const { checksum: claimed, ...body } = stored;
    expect(sha256Hex(body)).toBe(claimed.split(':').pop());
  });

  it('is idempotent — resealing an already-sealed receipt gives the same checksum', () => {
    const receipt = buildReceipt(makeReport());
    const first = sealReceipt(receipt);
    const second = sealReceipt({ ...receipt, checksum: first.checksum });
    expect(second.checksum).toBe(first.checksum);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js -t sealReceipt`
Expected: FAIL — `sealReceipt is not a function`.

- [ ] **Step 3: Write the implementation**

Append to `codex/core/pixelbrain/cyclotron-sensor.js`:

```js
// ── [SER] canonical-serializer (offers: artifact; seeks: structure) ────────
// ── [SEAL] bytecode-seal      (offers: checksum; seeks: artifact) ──────────
//
// NOTE: the canonical-serializer atom cites codex/core/pixelbrain/canonical-json.js.
// That module implements a DIFFERENT canonical form (Python float repr, for .pbrain
// packets). The evidence-integrity harness verifies self-seals by recomputing
// sha256Hex(body) === JSON.stringify(sortKeys(body)), so using the cited module here
// would make every receipt fail SELF_CHECKSUM_MISMATCH. Interop wins; the deviation
// is recorded in the spec.
export function sealReceipt(receipt) {
  const { checksum, ...body } = receipt;
  return { artifact: stableStringify(body), checksum: `cyclosensor1:${sha256Hex(body)}` };
}

// ── [VER] schema-verifier (offers: schema-verdict; seeks: artifact) ────────
export function verifyReceiptSchema(receipt) {
  const findings = [];
  if (receipt?.contract !== CYCLOTRON_SENSOR_CONTRACT) findings.push('NO_CONTRACT');
  if (typeof receipt?.schemaVersion !== 'string') findings.push('NO_SCHEMA_VERSION');
  if (typeof receipt?.inputClass !== 'string') findings.push('NO_INPUT_CLASS');
  if (!receipt?.inputs || Object.keys(receipt.inputs).length === 0) findings.push('NO_INPUTS');
  if (!receipt?.outputs || Object.keys(receipt.outputs).length === 0) findings.push('NO_OUTPUTS');
  return { ok: findings.length === 0, findings };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js`
Expected: PASS, all describes green.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/cyclotron-sensor.js tests/codex/core/pixelbrain/cyclotron-sensor.test.js
git commit -m "feat(cyclotron-sensor): seal receipts in the form the A2 harness verifies"
```

---

### Task 4: Stop the runner from overwriting the canonical artifact

**Files:**
- Modify: `scripts/semantic-valence-cyclotron.mjs` (the `OUTPUT_PATH` constant at line 23 and the `writeFileSync` at line 146)

**Interfaces:**
- Produces: a `--out=<path>` flag on the runner. When `--trials` is passed and differs from `DEFAULT_TRIALS`, `--out` becomes **required**.

This is not incidental cleanup. `OUTPUT_PATH` is hardcoded, so `--trials=2000` overwrites `docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json` — which is exactly integrity failure #1 from 2026-08-11 ("a 100,000-trial evidence artifact was overwritten by a 1,500-trial smoke test"). Task 6 runs the cyclotron at 2000 trials and would reproduce that failure. Fix it first.

The rule is a formula, not a judgement call: *if you are not running the canonical ritual, you must name your own output.*

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

const run = (args) => {
  try {
    execFileSync('node', ['scripts/semantic-valence-cyclotron.mjs', ...args],
      { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stderr: '' };
  } catch (error) {
    return { code: error.status, stderr: String(error.stderr) };
  }
};

describe('semantic-valence-cyclotron runner output guard', () => {
  it('refuses a non-default trial count without --out', () => {
    const { code, stderr } = run(['--trials=10']);
    expect(code).not.toBe(0);
    expect(stderr).toMatch(/--out is required/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js`
Expected: FAIL — the run succeeds (exit 0) and overwrites the 100k artifact. **Before running this step, back the artifact up:** `cp docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json /tmp/100k-backup.json`, and restore it after the step confirms the failure.

- [ ] **Step 3: Write the implementation**

In `scripts/semantic-valence-cyclotron.mjs`, add a string-flag parser next to `parseIntegerFlag`:

```js
function parseStringFlag(name) {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
}
```

Replace the `const OUTPUT_PATH = '…'` constant with a default, and resolve the destination where `trialCount` is parsed (near line 110):

```js
const DEFAULT_OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json';

function resolveOutputPath(trialCount) {
  const out = parseStringFlag('out');
  if (out) return out;
  if (trialCount !== DEFAULT_TRIALS) {
    throw new TypeError(
      `--out is required when --trials is not ${DEFAULT_TRIALS}: refusing to overwrite `
      + `${DEFAULT_OUTPUT_PATH} with a ${trialCount}-trial run`,
    );
  }
  return DEFAULT_OUTPUT_PATH;
}
```

Then thread the resolved path through: at line 146 write to `outputPath` instead of `OUTPUT_PATH`, and at line 158 log `outputPath`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js`
Expected: PASS.

Then confirm the canonical path still works and the escape hatch exists:

```bash
node scripts/semantic-valence-cyclotron.mjs --trials=10 --out=/tmp/smoke.json && echo OK
git status --short docs/superpowers/evidence/2026-08-11-semantic-valence-cyclotron-100k.json
```
Expected: `OK`, and the `git status` line is empty — the canonical artifact is untouched.

- [ ] **Step 5: Commit**

```bash
git add scripts/semantic-valence-cyclotron.mjs tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js
git commit -m "fix(cyclotron): require --out for non-canonical trial counts

A hardcoded OUTPUT_PATH meant --trials=2000 silently overwrote the 100k
evidence artifact. That exact failure happened on 2026-08-11."
```

---

### Task 5: The shell — ledger, approval, exit codes

**Files:**
- Create: `scripts/cyclotron-sensor.mjs`
- Test: `tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js`

**Interfaces:**
- Consumes: `buildReceipt`, `assess`, `sealReceipt`, `verifyReceiptSchema`, `CYCLOTRON_SENSOR_CONTRACT` from Task 1–3; `verifySemanticCyclotronReport` from `codex/core/pixelbrain/semantic-valence-cyclotron.js`.
- Produces: CLI `node scripts/cyclotron-sensor.mjs --report=<path> [--ledger=<path>] [--record] [--approve --reason=<text>]`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js`:

```js
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let dir;
let reportPath;
let ledgerPath;

const report = {
  contract: 'PB-SEMANTIC-CYCLOTRON-REPORT-v1',
  schemaVersion: '1.0.0',
  seed: 1, requestedTrials: 10, completedTrials: 10,
  atomBankChecksum: 'atombank1:aaaa',
  groundingIndexChecksum: 'grnd1:bbbb',
  chemistryProvenance: { schema: 'PB-CONCEPT-CHEM-v1', version: 'v2', weights: { relation: 0.45 } },
  configuration: { maxMoleculeSize: 5 },
  control: { bar: 0.2, percentile: 0.99, samples: 2 },
  counts: { nuclei: 1, shortlisted: 2 },
  candidates: [{
    finalScore: 0.77,
    molecule: { atomIds: ['a', 'b'], energy: 0.7, novelty: 0.3, grounding: 0.7 },
    conceptChemistry: { feasibility: 0.6 },
  }],
  checksum: 'cyclotron1:deadbeef',
};

// These fixtures are synthetic and carry no real engine checksum, so every
// invocation passes --trust-report. The shell prints TRUSTED_REPORT_UNVERIFIED
// whenever that flag is used, so the exemption can never be silent.
const run = (args) => {
  try {
    const stdout = execFileSync('node',
      ['scripts/cyclotron-sensor.mjs', '--trust-report', ...args],
      { encoding: 'utf8', stdio: 'pipe' });
    return { code: 0, stdout };
  } catch (error) {
    return { code: error.status, stdout: String(error.stdout) + String(error.stderr) };
  }
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'c-sensor-'));
  reportPath = join(dir, 'report.json');
  ledgerPath = join(dir, 'ledger.json');
  writeFileSync(reportPath, JSON.stringify(report));
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('cyclotron-sensor CLI', () => {
  it('reports NO_BASELINE and exits 0 when the ledger is absent', () => {
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/NO_BASELINE/);
  });

  it('refuses to approve without a reason', () => {
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve']);
    expect(code).toBe(2);
    expect(stdout).toMatch(/--reason/);
  });

  it('approves, then reports STABLE on the same report', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/STABLE/);
  });

  it('reports DEVIATION and exits 1 when an output moved under identical inputs', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    writeFileSync(reportPath, JSON.stringify({
      ...report, counts: { nuclei: 7, shortlisted: 2 }, checksum: 'cyclotron1:moved',
    }));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(1);
    expect(stdout).toMatch(/DEVIATION/);
    expect(stdout).toMatch(/count\.nuclei/);
  });

  it('ABSTAINs and exits 0 when an input changed', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    writeFileSync(reportPath, JSON.stringify({ ...report, seed: 999 }));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/ABSTAIN/);
    expect(stdout).toMatch(/seed/);
  });

  it('refuses to issue any verdict when the ledger self-seal is broken', () => {
    run([`--report=${reportPath}`, `--ledger=${ledgerPath}`, '--approve', '--reason=first baseline']);
    const tampered = JSON.parse(readFileSync(ledgerPath, 'utf8'));
    tampered.baselines[Object.keys(tampered.baselines)[0]].outputs['count.nuclei'] = 999;
    writeFileSync(ledgerPath, JSON.stringify(tampered));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(2);
    expect(stdout).toMatch(/LEDGER_SEAL_MISMATCH/);
    expect(stdout).not.toMatch(/STABLE/);
  });

  it('refuses a report with no chemistry provenance', () => {
    const { chemistryProvenance, ...stripped } = report;
    writeFileSync(reportPath, JSON.stringify(stripped));
    const { code, stdout } = run([`--report=${reportPath}`, `--ledger=${ledgerPath}`]);
    expect(code).toBe(2);
    expect(stdout).toMatch(/NO_CHEMISTRY_PROVENANCE/);
  });
});
```

**On `--trust-report`:** the default path verifies the report against its own checksum via `verifySemanticCyclotronReport` and refuses if it fails — a sensor must not seal an unverified reading. Synthetic test fixtures cannot satisfy that, so the shell accepts one documented escape, `--trust-report`, which skips only the report-checksum gate. It is a real hole, so it is made loud rather than hidden: the shell prints `TRUSTED_REPORT_UNVERIFIED` and stamps `trustedReportUnverified: true` into the receipt, which changes the receipt's seal. A trusted receipt can therefore never be mistaken for a verified one, in the ledger or anywhere downstream. Task 6 never uses the flag — every proof run goes through real verification.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js`
Expected: FAIL — `Cannot find module scripts/cyclotron-sensor.mjs`.

- [ ] **Step 3: Write the implementation**

Create `scripts/cyclotron-sensor.mjs`:

```js
#!/usr/bin/env node

/**
 * CYCLOTRON C-SENSOR — shell.
 *
 * Reads an already-written cyclotron report, builds a sealed receipt, compares it
 * against the approved baseline for its input class, and sets the exit code.
 * It does not run the cyclotron, and it never promotes a baseline on its own.
 *
 *   node scripts/cyclotron-sensor.mjs --report=<path>
 *   node scripts/cyclotron-sensor.mjs --report=<path> --record
 *   node scripts/cyclotron-sensor.mjs --report=<path> --approve --reason="<why>"
 *
 * Exit codes: 0 STABLE/ABSTAIN/NO_BASELINE, 1 DEVIATION, 2 refusal.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import {
  buildReceipt, assess, sealReceipt, verifyReceiptSchema,
} from '../codex/core/pixelbrain/cyclotron-sensor.js';
import { verifySemanticCyclotronReport } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { sha256Hex, stableStringify } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const LEDGER_CONTRACT = 'PB-CYCLOTRON-SENSOR-LEDGER-v1';
const LEDGER_SCHEMA_VERSION = '1.0.0';
const DEFAULT_LEDGER = 'docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json';

const flag = (name) => {
  const prefix = `--${name}=`;
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return raw ? raw.slice(prefix.length) : null;
};
const has = (name) => process.argv.slice(2).includes(`--${name}`);

function refuse(code, message) {
  console.error(`REFUSED ${code}: ${message}`);
  process.exit(2);
}

const sealLedger = (ledger) => {
  const { checksum, ...body } = ledger;
  return { ...body, checksum: `cyclosensor-ledger1:${sha256Hex(body)}` };
};

function readLedger(path) {
  if (!existsSync(path)) {
    return { contract: LEDGER_CONTRACT, schemaVersion: LEDGER_SCHEMA_VERSION, baselines: {}, receipts: {} };
  }
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const { checksum, ...body } = parsed;
  if (checksum !== `cyclosensor-ledger1:${sha256Hex(body)}`) {
    refuse('LEDGER_SEAL_MISMATCH',
      `${path} does not match its own seal — the sensor's record cannot be trusted, no verdict issued`);
  }
  return parsed;
}

const reportPath = flag('report');
if (!reportPath) refuse('NO_REPORT', 'pass --report=<path>');
const ledgerPath = flag('ledger') ?? DEFAULT_LEDGER;

let report;
try {
  report = JSON.parse(readFileSync(reportPath, 'utf8'));
} catch (error) {
  refuse('UNREADABLE_REPORT', `${reportPath}: ${error.message}`);
}

let trusted = false;
if (has('trust-report')) {
  trusted = true;
} else if (!verifySemanticCyclotronReport(report)) {
  refuse('REPORT_CHECKSUM_FAILED',
    `${reportPath} does not verify against its own checksum; refusing to seal an unverified reading`);
}

let receipt;
try {
  receipt = buildReceipt(report);
} catch (error) {
  refuse('INCOMPLETE_REPORT', error.message);
}
if (trusted) receipt.trustedReportUnverified = true;

const schema = verifyReceiptSchema(receipt);
if (!schema.ok) refuse('RECEIPT_SCHEMA', schema.findings.join(', '));

const seal = sealReceipt(receipt);
const ledger = readLedger(ledgerPath);
const baseline = ledger.baselines[receipt.inputClass] ?? null;
const reading = assess(receipt, baseline);

console.log(`report      ${reportPath}`);
console.log(`inputClass  ${receipt.inputClass}`);
console.log(`receipt     ${seal.checksum}`);
if (trusted) console.log('TRUSTED_REPORT_UNVERIFIED  report checksum was not verified');
console.log(`VERDICT     ${reading.verdict}${reading.reason ? ` (${reading.reason})` : ''}`);
for (const name of reading.differing) console.log(`  input changed  ${name}`);
for (const m of reading.moved) console.log(`  output moved   ${m.field}: ${stableStringify(m.baseline)} -> ${stableStringify(m.observed)}`);

if (has('approve')) {
  const reason = flag('reason');
  if (!reason) refuse('NO_REASON', 'approving a baseline requires --reason="<why>"');
  ledger.baselines[receipt.inputClass] = {
    ...receipt,
    approval: { reason, approvedAt: new Date().toISOString(), reportChecksum: receipt.outputs.reportChecksum },
  };
  writeFileSync(ledgerPath, `${JSON.stringify(sealLedger(ledger), null, 2)}\n`, 'utf8');
  console.log(`APPROVED    baseline for ${receipt.inputClass} written to ${ledgerPath}`);
  process.exit(0);
}

if (has('record')) {
  ledger.receipts[seal.checksum] = receipt;
  writeFileSync(ledgerPath, `${JSON.stringify(sealLedger(ledger), null, 2)}\n`, 'utf8');
  console.log(`RECORDED    ${seal.checksum} -> ${ledgerPath}`);
}

process.exit(reading.verdict === 'DEVIATION' ? 1 : 0);
```

The test's `run` helper already injects `--trust-report`, so no per-call changes are needed.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add scripts/cyclotron-sensor.mjs tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js
git commit -m "feat(cyclotron-sensor): ledger, explicit approval, and refusal-first exit codes"
```

---

### Task 6: The break-it-on-purpose proof

**Files:**
- Create: `docs/superpowers/evidence/2026-08-11-cyclotron-sensor-proof.md`
- Create (generated): `docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json`

**Interfaces:**
- Consumes: everything from Tasks 1–5.

The spec preregisters three runs and their expected outcomes. Until step 3 has been observed producing `DEVIATION`, **no claim that the sensor works may be made.**

- [ ] **Step 1: Produce a baseline run and approve it**

```bash
node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 \
  --out=/tmp/c-sensor-baseline.json
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-baseline.json \
  --approve --reason="2000-trial reference run for the C-sensor proof"
```
Expected: `NO_BASELINE`, then `APPROVED`.

- [ ] **Step 2: Replay the identical run — prove no false positive**

```bash
node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 \
  --out=/tmp/c-sensor-replay.json
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json; echo "exit=$?"
```
Expected: `VERDICT STABLE`, `exit=0`.

If this reports `DEVIATION`, stop. Either the cyclotron is not deterministic under a fixed seed, or a field in the output fingerprint is picking up run-to-run noise. Both invalidate the design and must be resolved before continuing.

- [ ] **Step 3: Perturb one chemistry weight in a worktree — prove it can fail**

Do **not** edit the working tree and do **not** use `git stash`; the tree is always dirty.

```bash
git worktree add /tmp/c-sensor-perturbed HEAD
# In /tmp/c-sensor-perturbed/codex/core/pixelbrain/concept-chemistry.js, change
# WEIGHTS_V2.relation from 0.45 to 0.44 and coherence from 0.15 to 0.16 so the
# weights still sum to 1.0.
cd /tmp/c-sensor-perturbed && node scripts/semantic-valence-cyclotron.mjs \
  --trials=2000 --seed=6045712 --out=/tmp/c-sensor-perturbed.json
cd -
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-perturbed.json; echo "exit=$?"
```

Expected: **`ABSTAIN (INPUT_CLASS_CHANGED)`, naming `chemistryWeights`** — because the weights are part of the input class, and the sensor correctly refuses to call a deliberate weight change "drift".

This is the honest outcome, and it is *not* a failure of the sensor. It also means step 3 does not yet prove `DEVIATION` can fire on real data. Do step 4.

- [ ] **Step 4: Perturb scoring logic that is NOT in the input class — the real proof**

```bash
# In /tmp/c-sensor-perturbed, revert the weight change, then change the ROUNDING
# in concept-chemistry.js relationScore() — e.g. round to 4 places instead of 6.
# Rounding is implementation, not declared provenance, so the input class is
# unchanged and any output movement is genuine code drift.
cd /tmp/c-sensor-perturbed && node scripts/semantic-valence-cyclotron.mjs \
  --trials=2000 --seed=6045712 --out=/tmp/c-sensor-drift.json
cd -
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-drift.json; echo "exit=$?"
```

Expected: **`VERDICT DEVIATION`, `exit=1`**, listing the moved fields (at minimum `reportChecksum`; likely `meanChemistryFeasibility` and `shortlistDigest`).

If this reports `STABLE`, the sensor cannot fail and the work is not done. Widen the output fingerprint until a real logic change is visible, then re-run every earlier task's tests.

- [ ] **Step 5: Revert and confirm no sticky state**

```bash
git worktree remove /tmp/c-sensor-perturbed --force
node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json; echo "exit=$?"
```
Expected: `VERDICT STABLE`, `exit=0`.

- [ ] **Step 6: Write the evidence document**

Create `docs/superpowers/evidence/2026-08-11-cyclotron-sensor-proof.md` recording, verbatim: the four verdicts observed, the exact moved-field list from step 4, the input class hashes, and this repro block (A2 requires a repro command or it emits `NO_REPRO_COMMAND`):

```
## Repro

    node scripts/semantic-valence-cyclotron.mjs --trials=2000 --seed=6045712 --out=/tmp/c-sensor-replay.json
    node scripts/cyclotron-sensor.mjs --report=/tmp/c-sensor-replay.json
    npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js
    npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js
```

State plainly which of the two perturbations produced `ABSTAIN` and which produced `DEVIATION`, and why that distinction is the whole point of the input class.

- [ ] **Step 7: Confirm the A2 harness accepts the new artifacts**

```bash
node scripts/evidence-integrity-harness.mjs; echo "exit=$?"
```
Expected: `errors 0`. The new ledger must not appear under `NO_SELF_CHECKSUM`, and the proof document must not appear under `NO_REPRO_COMMAND`. If either fires, fix the artifact — the sensor being audited by the harness it is a sibling of is the point.

- [ ] **Step 8: Commit**

```bash
git add docs/superpowers/evidence/2026-08-11-cyclotron-sensor-proof.md \
        docs/superpowers/evidence/CYCLOTRON-SENSOR-LEDGER.json \
        docs/superpowers/evidence/INTEGRITY-MANIFEST.json
git commit -m "evidence(cyclotron-sensor): observed STABLE, ABSTAIN, and DEVIATION on real runs"
```

---

## Definition of done

- `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js` — all green.
- Every field in `receipt.outputs` has been shown able to produce a `DEVIATION`; every field in `receipt.inputs` has been shown able to produce an `ABSTAIN`.
- `DEVIATION` has been observed on a real 2000-trial run with a deliberate logic change, and `STABLE` on the identical replay.
- `node scripts/evidence-integrity-harness.mjs` exits 0.
- No baseline was ever written except by an explicit `--approve --reason=…`.
