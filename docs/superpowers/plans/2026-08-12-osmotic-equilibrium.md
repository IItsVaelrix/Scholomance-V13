# Osmotic Equilibrium Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the Semantic Valence Cyclotron using osmosis as a novelty scorer, and make it govern equilibration of molecule occupancy instead.

**Architecture:** Osmosis currently contributes a saturated constant to `finalScore` and hard-gates every verdict. Both uses are removed. A new pure module (`osmotic-equilibrium.js`) converts occupancy heat into a crowding fraction and reads the membrane's `concentration` anomaly, which then replaces the magic number `entropyActivationHeat: 5` as the trigger for the existing entropic decay dampener. The dampener's transport law is untouched; osmosis governs *when* flow happens, not *how much*.

**Tech Stack:** Node ESM, vitest. No new dependencies.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-osmosis-equilibrium-design.md` (commit `40355775`).
- `evaluateMemoryCellOsmosis` in `codex/core/immunity/memory-cell-osmosis.js` MUST NOT change signature or semantics. Other consumers: `divtube_downloader/scripts/scholomance-bridge.mjs`, `tests/core/immunity/memory-cell-osmosis.test.js`.
- `codex/core/pixelbrain/entropic-decay-dampener.js` MUST NOT change. Its law stays `E_effective = E_intrinsic · exp(−λ · occupancyHeat)`.
- `codex/core/pixelbrain/concept-chemistry.js` MUST NOT be touched — it has unrelated uncommitted work in progress by another agent.
- Contract string for the new module: `PB-OSMOTIC-EQUILIBRIUM-v1`.
- Renormalised weights are computed as `0.50 / 0.85` and `0.35 / 0.85`, never hardcoded as rounded decimals.
- Validators must **reject** non-finite input, never coerce it.
- Run tests with `npx vitest run <path>`.
- Known-unrelated failures in the working tree: 11 tests in `bridge-corpus`/`calibration`/`grounding-index`/`phono-bond` fail from uncommitted `concept-chemistry.js` work, plus 1 pre-existing failure at HEAD (`bridge-corpus determinism 100-iteration replay`). Do not attempt to fix these; do not count them as regressions.

## File Structure

| file | responsibility |
|---|---|
| `codex/core/pixelbrain/osmotic-equilibrium.js` | **new.** Pure functions: heat → crowding, membrane result → equilibrate decision, concentration-limit calibration. No I/O, no engine imports. |
| `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js` | **new.** Unit tests for the above. |
| `codex/core/pixelbrain/semantic-valence-cyclotron.js` | **modified.** Scoring, verdict predicate, membrane wiring, default flip. |
| `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js` | **new.** Integration tests through `runSemanticValenceCyclotron`. |
| `scripts/calibrate-osmotic-membrane.mjs` | **new.** Derives `concentrationLimit` from a measured crowding distribution; aborts if the limit is unreachable or always exceeded. |
| `docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md` | **new.** Calibration + flattening evidence. |

### Shared test fixture

Both test files use this bank. Repeated in full in each task that needs it — do not factor it out into a helper the other tasks cannot see.

```js
const ATOM = (id, label, domain, offers, seeks, grounding) => ({
  id, label, domain, offers, seeks,
  traits: [], inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding,
});

const BANK = [
  ATOM('seed-a', 'deterministic sealed checksum source', 'synthesis', ['port-a'], [], 0.80),
  ATOM('mid-b', 'canonical schema verifier stage', 'governance', ['port-b'], ['port-a'], 0.85),
  ATOM('mid-c', 'concept chemistry feasibility scorer', 'immunity', ['port-c'], ['port-b'], 0.88),
  ATOM('end-d', 'evidence ledger structure sink', 'artifact', ['port-d'], ['port-c'], 0.90),
];

const RUN = (overrides = {}) => ({
  atoms: BANK,
  trialCount: 600,
  seed: 0x4f534d4f,
  maxMoleculeSize: 4,
  controlEvery: 5,
  controlPercentile: 0.99,
  shortlistLimit: 64,
  shortlistFamilyCap: 4,
  noveltyFloor: 0.04,
  finalScoreFloor: 0.30,
  nucleusScoreFloor: 0.60,
  nucleusNoveltyFloor: 0.20,
  nucleusMinDomains: 3,
  ...overrides,
});
```

---

### Task 1: Pure equilibrium module

**Files:**
- Create: `codex/core/pixelbrain/osmotic-equilibrium.js`
- Test: `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `OSMOTIC_EQUILIBRIUM_CONTRACT: string`, `crowdingFromHeat(occupancyHeat: number) => number` in `[0,1)`, `shouldEquilibrate(osmosis: {anomalyKind: string}) => boolean`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  OSMOTIC_EQUILIBRIUM_CONTRACT,
  crowdingFromHeat,
  shouldEquilibrate,
} from '../../../../codex/core/pixelbrain/osmotic-equilibrium.js';

describe('crowdingFromHeat', () => {
  it('maps an unvisited region to zero crowding', () => {
    expect(crowdingFromHeat(0)).toBe(0);
  });

  it('increases with heat and stays below 1', () => {
    const low = crowdingFromHeat(1);
    const mid = crowdingFromHeat(5);
    const high = crowdingFromHeat(1000);
    expect(low).toBeLessThan(mid);
    expect(mid).toBeLessThan(high);
    expect(high).toBeLessThan(1);
  });

  it('rejects non-finite heat instead of coercing it', () => {
    expect(() => crowdingFromHeat(Number.NaN)).toThrow(/finite/i);
    expect(() => crowdingFromHeat(Number.POSITIVE_INFINITY)).toThrow(/finite/i);
  });

  it('rejects negative heat', () => {
    expect(() => crowdingFromHeat(-1)).toThrow(/>= 0/);
  });
});

describe('shouldEquilibrate', () => {
  it('fires when the membrane reports over-concentration', () => {
    expect(shouldEquilibrate({ anomalyKind: 'concentration' })).toBe(true);
  });

  it('does NOT fire on baseline drift — drift is not crowding', () => {
    expect(shouldEquilibrate({ anomalyKind: 'baseline_drift' })).toBe(false);
  });

  it('does not fire when the membrane is silent', () => {
    expect(shouldEquilibrate({ anomalyKind: 'none' })).toBe(false);
  });

  it('does not fire on a missing result', () => {
    expect(shouldEquilibrate(undefined)).toBe(false);
  });
});

describe('contract', () => {
  it('declares its identity', () => {
    expect(OSMOTIC_EQUILIBRIUM_CONTRACT).toBe('PB-OSMOTIC-EQUILIBRIUM-v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`
Expected: FAIL — `Failed to resolve import ".../osmotic-equilibrium.js"`.

Then create the file with stubs so the assertions can run and fail properly:

```js
export const OSMOTIC_EQUILIBRIUM_CONTRACT = 'PB-OSMOTIC-EQUILIBRIUM-v1';
export function crowdingFromHeat() { return 0; }
export function shouldEquilibrate() { return false; }
```

Re-run. Expected: 5 failures with real assertion messages (`expected 0 to be less than 0`, `expected [Function] to throw`, `expected false to be true`). 2 pass. Do not proceed until you have seen assertion failures, not import errors.

- [ ] **Step 3: Write minimal implementation**

Replace `codex/core/pixelbrain/osmotic-equilibrium.js` with:

```js
/**
 * OSMOTIC EQUILIBRIUM — PB-OSMOTIC-EQUILIBRIUM-v1
 *
 * Osmosis is transport toward even concentration. It does not rate anything.
 *
 * This module converts the entropic decay dampener's `occupancyHeat` into a
 * bounded crowding fraction suitable for a memory cell's `concentration`
 * observation, and reads the membrane's verdict. The membrane decides WHEN
 * equilibration pressure applies; the dampener decides HOW MUCH.
 *
 * Before 2026-08-12 the cyclotron fed `concentration: molecule.energy` — a
 * score — so the `concentration` branch was dead and everything fell through
 * to `baseline_drift`, which saturated at confidence 1.0 for all 256
 * shortlisted molecules in both banks measured.
 */

export const OSMOTIC_EQUILIBRIUM_CONTRACT = 'PB-OSMOTIC-EQUILIBRIUM-v1';

/**
 * Occupancy heat is unbounded above; a membrane concentration must be a unit
 * fraction. h/(1+h) is monotone, hits 0 at h=0, and approaches but never
 * reaches 1.
 *
 * @param {number} occupancyHeat
 * @returns {number} crowding in [0,1)
 */
export function crowdingFromHeat(occupancyHeat) {
  if (!Number.isFinite(occupancyHeat)) {
    throw new TypeError(
      `crowdingFromHeat: occupancyHeat must be finite, got ${occupancyHeat}`,
    );
  }
  if (occupancyHeat < 0) {
    throw new RangeError(
      `crowdingFromHeat: occupancyHeat must be >= 0, got ${occupancyHeat}`,
    );
  }
  return occupancyHeat / (1 + occupancyHeat);
}

/**
 * Equilibration applies only on over-concentration. `baseline_drift` is a
 * novelty signal and must never trigger transport.
 *
 * @param {{anomalyKind?: string}} [osmosis]
 * @returns {boolean}
 */
export function shouldEquilibrate(osmosis) {
  return osmosis?.anomalyKind === 'concentration';
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`
Expected: `Tests  7 passed (7)`

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/osmotic-equilibrium.js tests/codex/core/pixelbrain/osmotic-equilibrium.test.js
git commit -m "feat(osmosis): pure equilibrium module — heat to crowding, concentration to transport"
```

---

### Task 2: Remove osmosis from finalScore

**Files:**
- Modify: `codex/core/pixelbrain/semantic-valence-cyclotron.js:711` (delete), `:714-718` (reweight)
- Test: `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces: `finalScore === ENERGY_WEIGHT * energy + FEASIBILITY_WEIGHT * feasibility`, where `ENERGY_WEIGHT = 0.50 / 0.85` and `FEASIBILITY_WEIGHT = 0.35 / 0.85`, both module-level `const` in the cyclotron.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { runSemanticValenceCyclotron } from '../../../../codex/core/pixelbrain/semantic-valence-cyclotron.js';

const ATOM = (id, label, domain, offers, seeks, grounding) => ({
  id, label, domain, offers, seeks,
  traits: [], inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding,
});

const BANK = [
  ATOM('seed-a', 'deterministic sealed checksum source', 'synthesis', ['port-a'], [], 0.80),
  ATOM('mid-b', 'canonical schema verifier stage', 'governance', ['port-b'], ['port-a'], 0.85),
  ATOM('mid-c', 'concept chemistry feasibility scorer', 'immunity', ['port-c'], ['port-b'], 0.88),
  ATOM('end-d', 'evidence ledger structure sink', 'artifact', ['port-d'], ['port-c'], 0.90),
];

const RUN = (overrides = {}) => ({
  atoms: BANK,
  trialCount: 600,
  seed: 0x4f534d4f,
  maxMoleculeSize: 4,
  controlEvery: 5,
  controlPercentile: 0.99,
  shortlistLimit: 64,
  shortlistFamilyCap: 4,
  noveltyFloor: 0.04,
  finalScoreFloor: 0.30,
  nucleusScoreFloor: 0.60,
  nucleusNoveltyFloor: 0.20,
  nucleusMinDomains: 3,
  ...overrides,
});

const ENERGY_WEIGHT = 0.50 / 0.85;
const FEASIBILITY_WEIGHT = 0.35 / 0.85;

describe('finalScore excludes osmosis', () => {
  it('is exactly the renormalised energy + feasibility sum', () => {
    const report = runSemanticValenceCyclotron(RUN());
    expect(report.candidates.length).toBeGreaterThan(0);

    for (const candidate of report.candidates) {
      const energy = candidate.molecule.energy;
      const feasibility = Math.min(1, Math.max(0, candidate.conceptChemistry.feasibility));
      const expected = Math.min(1, ENERGY_WEIGHT * energy + FEASIBILITY_WEIGHT * feasibility);
      expect(candidate.finalScore).toBeCloseTo(expected, 5);
    }
  });

  it('no longer carries the old flat +0.15 osmotic term', () => {
    const report = runSemanticValenceCyclotron(RUN());
    const candidate = report.candidates[0];
    const energy = candidate.molecule.energy;
    const feasibility = Math.min(1, Math.max(0, candidate.conceptChemistry.feasibility));
    const oldFormula = Math.min(1, 0.50 * energy + 0.35 * feasibility + 0.15 * 1.0);
    expect(candidate.finalScore).not.toBeCloseTo(oldFormula, 4);
  });

  it('still reports osmosis as a diagnostic field', () => {
    const report = runSemanticValenceCyclotron(RUN());
    expect(report.candidates[0]).toHaveProperty('osmosis');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`
Expected: the first two tests FAIL. The first reports a difference of roughly `0.15` (the removed constant) plus the reweighting difference. The third PASSES already — that is correct, it is a regression guard for a field we intend to keep.

- [ ] **Step 3: Write minimal implementation**

In `codex/core/pixelbrain/semantic-valence-cyclotron.js`, add module-level constants next to the other contract constants near line 37:

```js
// Osmosis was removed from finalScore on 2026-08-12 (PB-OSMOTIC-EQUILIBRIUM-v1).
// The original 50:35 energy:feasibility ratio is preserved, rescaled to [0,1].
const ENERGY_WEIGHT = 0.50 / 0.85;
const FEASIBILITY_WEIGHT = 0.35 / 0.85;
```

Delete line 711 entirely:

```js
  const osmoticNovelty = osmosis.anomalyKind === 'baseline_drift' ? osmosis.confidence : 0;
```

Replace lines 714-718 with:

```js
  const finalScore = clamp01(
    ENERGY_WEIGHT * row.molecule.energy
    + FEASIBILITY_WEIGHT * clamp01(conceptChemistry.feasibility),
  );
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`
Expected: `Tests  3 passed (3)`

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/semantic-valence-cyclotron.js tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js
git commit -m "fix(cyclotron): osmosis no longer scores — remove saturated 15% term, renormalise 50:35"
```

---

### Task 3: Remove the baseline_drift verdict gate

**Files:**
- Modify: `codex/core/pixelbrain/semantic-valence-cyclotron.js:720-733`
- Test: `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js` (append)

**Interfaces:**
- Consumes: Task 2's `finalScore` change.
- Produces: verdict predicate reads only `conceptChemistry`, `domainCount`, `atoms.length`, `molecule.novelty`, `finalScore`.

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`:

```js
describe('verdict predicate ignores osmosis', () => {
  it('crowns a candidate whose osmosis is silent', () => {
    // Before the fix, `anomalyKind === 'baseline_drift'` was required for BOTH
    // NUCLEUS and HYPOTHESIS. It admitted 256/256 rows, so it never blocked
    // anything — which is the argument for deleting it. This asserts the
    // predicate no longer consults the field at all.
    const report = runSemanticValenceCyclotron(RUN());
    const judged = report.candidates.filter((c) => c.verdict !== 'REFUSED');
    expect(judged.length).toBeGreaterThan(0);

    const source = report.candidates.map((c) => c.osmosis?.anomalyKind);
    for (const candidate of judged) {
      // whatever osmosis said, the verdict must be derivable without it
      const reproduced = candidate.finalScore >= 0.30;
      expect(reproduced).toBe(true);
    }
    expect(source.length).toBe(report.candidates.length);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js -t "ignores osmosis"`

Expected: This test may PASS immediately because `baseline_drift` currently admits everything. **That is the whole problem and it means the test is inadequate.** Replace it with the break-on-purpose version below, which forces the gate to matter:

```js
describe('verdict predicate ignores osmosis', () => {
  it('crowns candidates even when the membrane would report no drift', () => {
    // Force the membrane silent by making drift impossible: a similarityFloor
    // of 0 and driftCeiling of 1 mean `baseline_drift` can never fire.
    const report = runSemanticValenceCyclotron(RUN({
      osmosisSimilarityFloor: 0,
      osmosisDriftCeiling: 1,
    }));
    const drifted = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'baseline_drift',
    );
    expect(drifted.length).toBe(0);   // precondition: the gate would have closed

    const judged = report.candidates.filter((c) => c.verdict !== 'REFUSED');
    expect(judged.length).toBeGreaterThan(0);  // fails today: gate closed => all REFUSED
  });
});
```

Re-run. Expected: FAIL with `expected 0 to be greater than 0` — every candidate is REFUSED because the gate closed.

- [ ] **Step 3: Write minimal implementation**

In `finalizeCandidate`, delete the `osmosis.anomalyKind === 'baseline_drift' &&` line from the NUCLEUS branch and the HYPOTHESIS branch, leaving:

```js
  let verdict = 'REFUSED';
  if (
    conceptChemistry.stability !== 'UNSTABLE'
    && !repelled
    && atoms.length >= config.nucleusMinDomains
    && domainCount >= config.nucleusMinDomains
    && row.molecule.novelty >= config.nucleusNoveltyFloor
    && finalScore >= config.nucleusScoreFloor
  ) {
    verdict = 'NUCLEUS';
  } else if (
    !repelled
    && finalScore >= config.finalScoreFloor
  ) {
    verdict = 'HYPOTHESIS';
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`
Expected: `Tests  4 passed (4)`

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/semantic-valence-cyclotron.js tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js
git commit -m "fix(cyclotron): drop baseline_drift verdict gate — it admitted 256/256"
```

---

### Task 4: Wire the membrane over occupancy

**Files:**
- Modify: `codex/core/pixelbrain/semantic-valence-cyclotron.js:389` (concentrationLimit), `:625-661` (selectLicensedTrial), `:703-710` (finalizeCandidate reads the row)
- Test: `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js` (append)

**Interfaces:**
- Consumes: `crowdingFromHeat`, `shouldEquilibrate` from Task 1.
- Produces: rows carry `osmosis` (the membrane result) and `crowding` (number). `finalizeCandidate` reads `row.osmosis ?? null` rather than calling `evaluateMemoryCellOsmosis` itself. New config key `osmosisConcentrationLimit` (default `0.5`, recalibrated in Task 5).

- [ ] **Step 1: Write the failing test**

Append:

```js
describe('membrane governs occupancy, not novelty', () => {
  it('feeds the membrane a crowding fraction, not an energy score', () => {
    const report = runSemanticValenceCyclotron(RUN({ entropy: { enabled: true } }));
    const withOsmosis = report.candidates.filter((c) => c.osmosis);
    expect(withOsmosis.length).toBeGreaterThan(0);

    for (const candidate of withOsmosis) {
      // concentration must be a crowding fraction in [0,1), and must NOT equal
      // the molecule's energy — that was the category error.
      expect(candidate.osmosis.concentration).toBeGreaterThanOrEqual(0);
      expect(candidate.osmosis.concentration).toBeLessThan(1);
    }
    const matchesEnergy = withOsmosis.filter(
      (c) => Math.abs(c.osmosis.concentration - c.molecule.energy) < 1e-6,
    );
    expect(matchesEnergy.length).toBe(0);
  });

  it('reports over-concentration on a bank small enough to saturate', () => {
    // 4 atoms and 600 trials guarantees heavy revisiting, so crowding must
    // clear a 0.5 limit somewhere.
    const report = runSemanticValenceCyclotron(RUN({
      entropy: { enabled: true },
      osmosisConcentrationLimit: 0.5,
    }));
    const concentrated = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'concentration',
    );
    expect(concentrated.length).toBeGreaterThan(0);
  });

  it('stays silent when the limit is above anything reachable', () => {
    // Discrimination check: a membrane that always fires is no membrane.
    const report = runSemanticValenceCyclotron(RUN({
      entropy: { enabled: true },
      osmosisConcentrationLimit: 0.999999,
    }));
    const concentrated = report.candidates.filter(
      (c) => c.osmosis?.anomalyKind === 'concentration',
    );
    expect(concentrated.length).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js -t "membrane governs"`
Expected: FAIL. The first test fails because `concentration` currently equals `molecule.energy` for every row (`matchesEnergy.length` will equal `withOsmosis.length`). The second fails because `osmosisConcentrationLimit` is not a recognised option and `concentrationLimit` is hardcoded to `1`.

- [ ] **Step 3: Write minimal implementation**

**3a.** Add the import at the top of `semantic-valence-cyclotron.js`, next to the `memory-cell-osmosis` import:

```js
import { crowdingFromHeat, shouldEquilibrate } from './osmotic-equilibrium.js';
```

**3b.** Add to `DEFAULTS` near line 60:

```js
  osmosisConcentrationLimit: 0.5,
```

**3c.** Add to `normalizeConfig` near line 233, following the existing `unit(...)` pattern:

```js
    osmosisConcentrationLimit: unit(
      options.osmosisConcentrationLimit,
      DEFAULTS.osmosisConcentrationLimit,
      'osmosisConcentrationLimit',
    ),
```

**3d.** At line 389 replace the hardcoded limit:

```js
      concentrationLimit: config.osmosisConcentrationLimit,
```

**3e.** In `selectLicensedTrial`, compute the membrane result and use it instead of `entropyActivationHeat`. Replace the body from the early return through the activation check:

```js
function selectLicensedTrial(prepared, config, trialIndex, environment, occupancy) {
  const baselineTrial = buildLicensedTrial(prepared, config, trialIndex, environment);
  if (!baselineTrial) return null;
  const baselineRow = scoreTrial(prepared, baselineTrial);
  if (!config.entropyEnabled || config.entropyEscapeAttempts === 0) return baselineRow;

  const baselineRevisits = moleculeOccupancy(prepared, occupancy, baselineRow.molecule);
  const baselineInfluence = effectiveSearchAttraction(
    config,
    baselineRevisits,
    baselineRow.molecule.energy,
  );
  const baselineCrowding = crowdingFromHeat(baselineInfluence.occupancyHeat);
  const baselineOsmosis = evaluateMemoryCellOsmosis(prepared.baselineCell, {
    vector: baselineRow.vector,
    concentration: baselineCrowding,
    seed: 42,
  });
  const withOsmosis = {
    ...baselineRow,
    osmosis: baselineOsmosis,
    crowding: baselineCrowding,
  };
  // The membrane decides WHEN transport happens. Previously this was
  // `occupancyHeat < config.entropyActivationHeat`, a bare magic number.
  if (!shouldEquilibrate(baselineOsmosis)) return withOsmosis;

  let selected = withOsmosis;
  let selectedInfluence = baselineInfluence;
  let selectedAttempt = 0;
```

Then inside the escape loop, after `const influence = effectiveSearchAttraction(...)` at line 650, attach the membrane result to the alternate before it can be selected:

```js
    const alternateCrowding = crowdingFromHeat(influence.occupancyHeat);
    const alternateRow = {
      ...alternate,
      osmosis: evaluateMemoryCellOsmosis(prepared.baselineCell, {
        vector: alternate.vector,
        concentration: alternateCrowding,
        seed: 42,
      }),
      crowding: alternateCrowding,
    };
```

and change the two `selected = alternate;` / comparison references to use `alternateRow`:

```js
    if (influence.attraction > selectedInfluence.attraction
      || (influence.attraction === selectedInfluence.attraction
        && alternateRow.molecule.checksum.localeCompare(selected.molecule.checksum) < 0)) {
      selected = alternateRow;
      selectedInfluence = influence;
      selectedAttempt = attempt;
    }
```

**3f.** Delete `entropyActivationHeat` from `DEFAULTS` (line 68) and from `normalizeConfig` (lines 253-256). Remove it from the report's configuration echo if present.

**3g.** In `finalizeCandidate`, delete the `evaluateMemoryCellOsmosis` call (lines 706-710) and read the row instead:

```js
  const osmosis = row.osmosis ?? null;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`
Expected: `Tests  7 passed (7)`

Then run the whole cyclotron group for regressions:
Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-sensor.test.js tests/codex/core/pixelbrain/cyclotron-sensor-cli.test.js tests/codex/core/pixelbrain/cyclotron-runner-out-flag.test.js tests/codex/core/pixelbrain/gate-reachability.test.js`
Expected: all pass. If a sensor test asserts on `entropyActivationHeat` in a config echo, update that assertion — the key is intentionally gone.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/semantic-valence-cyclotron.js tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js
git commit -m "feat(cyclotron): osmotic membrane governs occupancy, replacing entropyActivationHeat"
```

---

### Task 5: Calibrate concentrationLimit from measurement

**Files:**
- Create: `scripts/calibrate-osmotic-membrane.mjs`
- Modify: `codex/core/pixelbrain/osmotic-equilibrium.js` (add `calibrateConcentrationLimit`)
- Test: `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js` (append)

**Interfaces:**
- Consumes: `crowdingFromHeat` from Task 1.
- Produces: `calibrateConcentrationLimit(samples: number[], {percentile?: number}) => {limit: number, clearedFraction: number, admissible: boolean, reason: string|null}`.

- [ ] **Step 1: Write the failing test**

Append to `tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`:

```js
import { calibrateConcentrationLimit } from '../../../../codex/core/pixelbrain/osmotic-equilibrium.js';

describe('calibrateConcentrationLimit', () => {
  it('places the limit at the requested upper percentile of observed crowding', () => {
    const samples = Array.from({ length: 100 }, (_, i) => i / 100);  // 0.00 .. 0.99
    const result = calibrateConcentrationLimit(samples, { percentile: 0.90 });
    expect(result.limit).toBeCloseTo(0.90, 2);
    expect(result.admissible).toBe(true);
  });

  it('refuses a limit nothing can reach', () => {
    const samples = Array.from({ length: 50 }, () => 0.01);
    const result = calibrateConcentrationLimit(samples, { percentile: 0.90 });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/0%|unreachable/i);
  });

  it('refuses a limit everything exceeds', () => {
    const samples = Array.from({ length: 50 }, () => 0.99);
    const result = calibrateConcentrationLimit(samples, { percentile: 0.0 });
    expect(result.admissible).toBe(false);
    expect(result.reason).toMatch(/100%|always/i);
  });

  it('refuses an empty sample rather than inventing a limit', () => {
    expect(() => calibrateConcentrationLimit([], {})).toThrow(/no samples/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/osmotic-equilibrium.test.js -t calibrate`
Expected: FAIL — `calibrateConcentrationLimit is not a function`.

- [ ] **Step 3: Write minimal implementation**

Append to `codex/core/pixelbrain/osmotic-equilibrium.js`:

```js
/**
 * Derive a membrane permeability threshold from an observed crowding
 * distribution. A limit nothing reaches, or one everything exceeds, is a check
 * that cannot fail — so this refuses rather than returning it.
 *
 * @param {number[]} samples observed crowding values
 * @param {{percentile?: number}} [options]
 */
export function calibrateConcentrationLimit(samples, options = {}) {
  if (!Array.isArray(samples) || samples.length === 0) {
    throw new TypeError('calibrateConcentrationLimit: no samples — cannot derive a limit');
  }
  const percentile = Number.isFinite(options.percentile) ? options.percentile : 0.90;
  const sorted = [...samples].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round(percentile * (sorted.length - 1))),
  );
  const limit = sorted[index];
  const clearedBy = samples.filter((value) => value >= limit).length;
  const clearedFraction = clearedBy / samples.length;

  let reason = null;
  if (clearedFraction === 0) {
    reason = `limit ${limit} is unreachable — 0% of ${samples.length} samples clear it`;
  } else if (clearedFraction === 1) {
    reason = `limit ${limit} always fires — 100% of ${samples.length} samples clear it`;
  }

  return { limit, clearedFraction, admissible: reason === null, reason };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/osmotic-equilibrium.test.js`
Expected: `Tests  11 passed (11)`

- [ ] **Step 5: Write the calibration script**

Create `scripts/calibrate-osmotic-membrane.mjs`:

```js
#!/usr/bin/env node

/**
 * Derive `osmosisConcentrationLimit` from measured crowding, and refuse to
 * report one that cannot discriminate.
 *
 *   node scripts/calibrate-osmotic-membrane.mjs
 */

import { writeFileSync } from 'node:fs';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { calibrateConcentrationLimit } from '../codex/core/pixelbrain/osmotic-equilibrium.js';

const OUT = 'docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md';
const SEED = 0x4f534d4f;

function bank() {
  const A = (id, label, domain, offers, seeks, grounding) => ({
    id, label, domain, offers, seeks, traits: [], inhibits: [],
    evidence: ['codex/core/pixelbrain/canonical-json.js'], grounding,
  });
  return [
    A('seed-a', 'deterministic sealed checksum source', 'synthesis', ['port-a'], [], 0.80),
    A('mid-b', 'canonical schema verifier stage', 'governance', ['port-b'], ['port-a'], 0.85),
    A('mid-c', 'concept chemistry feasibility scorer', 'immunity', ['port-c'], ['port-b'], 0.88),
    A('end-d', 'evidence ledger structure sink', 'artifact', ['port-d'], ['port-c'], 0.90),
  ];
}

const report = runSemanticValenceCyclotron({
  atoms: bank(),
  trialCount: 8000,
  seed: SEED,
  maxMoleculeSize: 4,
  controlEvery: 5,
  shortlistLimit: 256,
  entropy: { enabled: true },
  osmosisConcentrationLimit: 0.5,
});

const samples = report.candidates
  .map((c) => c.osmosis?.concentration)
  .filter(Number.isFinite);

const calibration = calibrateConcentrationLimit(samples, { percentile: 0.90 });

console.log(`samples: ${samples.length}`);
console.log(`min=${Math.min(...samples).toFixed(6)} max=${Math.max(...samples).toFixed(6)}`);
console.log(`limit=${calibration.limit} cleared=${(calibration.clearedFraction * 100).toFixed(1)}%`);
console.log(`admissible=${calibration.admissible}`);
if (!calibration.admissible) {
  console.error(`ABORT: ${calibration.reason}`);
  process.exitCode = 1;
}

writeFileSync(OUT, [
  '# Osmotic Membrane Calibration',
  '',
  '**Contract:** `PB-OSMOTIC-EQUILIBRIUM-v1`',
  `**Seed:** \`0x${SEED.toString(16)}\``,
  '',
  '| statistic | value |',
  '|---|---|',
  `| samples | ${samples.length} |`,
  `| min crowding | ${Math.min(...samples).toFixed(6)} |`,
  `| max crowding | ${Math.max(...samples).toFixed(6)} |`,
  `| derived limit (p90) | ${calibration.limit} |`,
  `| cleared by | ${(calibration.clearedFraction * 100).toFixed(1)}% |`,
  `| admissible | ${calibration.admissible} |`,
  '',
  calibration.reason ? `> ABORT: ${calibration.reason}` : '> Limit discriminates: neither 0% nor 100%.',
  '',
].join('\n'));
console.log(`Evidence: ${OUT}`);
```

- [ ] **Step 6: Run the calibration**

Run: `node scripts/calibrate-osmotic-membrane.mjs`
Expected: prints a limit with `admissible=true`. **If it aborts, do not hand-pick a limit** — widen `trialCount` or report back that this bank cannot produce a discriminating membrane.

Then update `DEFAULTS.osmosisConcentrationLimit` in `semantic-valence-cyclotron.js` to the derived value, and re-run Task 4's tests to confirm the third test (`stays silent when the limit is above anything reachable`) still passes with `0.999999`.

- [ ] **Step 7: Commit**

```bash
git add codex/core/pixelbrain/osmotic-equilibrium.js tests/codex/core/pixelbrain/osmotic-equilibrium.test.js scripts/calibrate-osmotic-membrane.mjs docs/superpowers/evidence/2026-08-12-osmotic-equilibrium.md codex/core/pixelbrain/semantic-valence-cyclotron.js
git commit -m "feat(osmosis): derive concentrationLimit from measured crowding, abort if it cannot discriminate"
```

---

### Task 6: Enable equilibration by default and prove it flattens

**Files:**
- Modify: `codex/core/pixelbrain/semantic-valence-cyclotron.js:62`
- Test: `tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js` (append)

**Interfaces:**
- Consumes: everything from Tasks 1-5.
- Produces: `DEFAULTS.entropyEnabled === true`.

This is the break-on-purpose task. Without it we have built a second membrane that does nothing.

- [ ] **Step 1: Write the failing test**

Append:

```js
describe('equilibration actually evens occupancy', () => {
  const spread = (report) => {
    // Population variance of exact-revisit counts across distinct molecules.
    // Flatter occupancy => lower variance.
    const counts = new Map();
    for (const candidate of report.candidates) {
      const key = candidate.molecule.checksum;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const values = [...counts.values()];
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  };

  it('produces flatter occupancy with the membrane on than off', () => {
    const on = runSemanticValenceCyclotron(RUN({ trialCount: 4000, entropy: { enabled: true } }));
    const off = runSemanticValenceCyclotron(RUN({ trialCount: 4000, entropy: { enabled: false } }));
    expect(spread(on)).toBeLessThan(spread(off));
  });

  it('is on by default', () => {
    const explicit = runSemanticValenceCyclotron(RUN({ trialCount: 4000, entropy: { enabled: true } }));
    const byDefault = runSemanticValenceCyclotron(RUN({ trialCount: 4000 }));
    expect(byDefault.counts.shortlisted).toBe(explicit.counts.shortlisted);
    expect(spread(byDefault)).toBe(spread(explicit));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js -t "evens occupancy"`
Expected: the second test FAILS (default is still `false`, so `byDefault` matches the OFF arm, not the ON arm). The first test must PASS — if it does not, **stop**: the membrane is not flattening anything and Task 4's wiring is wrong. Report that rather than proceeding.

- [ ] **Step 3: Write minimal implementation**

At line 62 of `semantic-valence-cyclotron.js`:

```js
  entropyEnabled: true,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js`
Expected: `Tests  9 passed (9)`

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/semantic-valence-cyclotron.js tests/codex/core/pixelbrain/cyclotron-osmosis-equilibrium.test.js
git commit -m "feat(cyclotron): equilibration on by default, with measured proof it flattens occupancy"
```

---

### Task 7: Recalibrate floors and regenerate the evidence corpus

**Files:**
- Modify: `scripts/super-heavy-nucleus-attack.mjs`, `scripts/architectural-density-control.mjs`
- Regenerate: `docs/superpowers/evidence/2026-08-11-super-heavy-nucleus-attack.{md,json}`, `docs/superpowers/evidence/2026-08-11-architectural-density-control.{md,json}`

**Interfaces:**
- Consumes: the new scoring range from Tasks 2-6.
- Produces: recalibrated `nucleusScoreFloor` / `nucleusNoveltyFloor` in both scripts, and regenerated evidence.

- [ ] **Step 1: Measure the new reachable range**

Run each script unchanged first and read the `P0 — Gate reachability` table (super-heavy) and the `arm score ceiling` row (density control):

```bash
node scripts/super-heavy-nucleus-attack.mjs --trials=5000
node scripts/architectural-density-control.mjs --trials=8000
```

Expected: both now report **VACUOUS / INADMISSIBLE** for every arm, because `nucleusScoreFloor: 0.765` is far above the new ceiling. This is `PB-GATE-REACHABILITY-v1` working correctly — it is the confirmation that recalibration is required, not a failure.

Record each arm's ceiling from those tables.

- [ ] **Step 2: Set floors from the measurement**

In both scripts, set `nucleusScoreFloor` to the value that leaves the **positive** arm able to crown while keeping the floor inside the measured range. For `architectural-density-control.mjs` the positive arm is DENSITY; use a floor strictly below DENSITY's ceiling and above MUTANT's. For `super-heavy-nucleus-attack.mjs` there is no positive arm — set the floor from that bank's own measured p90 finalScore so the probe can distinguish sizes rather than refusing everything.

Do not reuse `0.765`. Do not pick a round number because it looks tidy.

- [ ] **Step 3: Regenerate and verify admissibility**

```bash
node scripts/super-heavy-nucleus-attack.mjs --trials=5000
node scripts/architectural-density-control.mjs --trials=8000
```

Expected: the density control's DENSITY arm reports `could this arm crown at all? yes`. Any arm still marked inadmissible must be reported as such, not tuned until it passes.

- [ ] **Step 4: Check the three recorded predictions**

The spec recorded these before the work. Report each as held or refuted, with numbers:

1. Topology Δceiling (was `0.010502`, sd 0 over 12 seeds) survives, being a difference rather than a level.
2. The `inventory-seed` exclusion persists, since it runs through novelty and feasibility which this change does not touch.
3. All crown counts move.

- [ ] **Step 5: Commit**

```bash
git add scripts/super-heavy-nucleus-attack.mjs scripts/architectural-density-control.mjs docs/superpowers/evidence/
git commit -m "evidence: recalibrate floors for the osmosis-free score range, regenerate corpus"
```

---

## Self-Review

**Spec coverage:**

| spec section | task |
|---|---|
| 1 Boundary — osmosis primitive and dampener unchanged | Global Constraints |
| 2 Membrane over occupancy | Task 1 (pure functions), Task 4 (wiring) |
| 2 `concentrationLimit` derivation procedure | Task 5 |
| 3 Scoring — renormalise, osmosis diagnostic only | Task 2 |
| 4 Verdict predicate | Task 3 |
| 5 Recalibration, `entropyEnabled` default | Task 6, Task 7 |
| 6 Testing — all five listed tests | Task 1 (fires/silent), Task 2 (no osmosis term), Task 3 (verdict ignores), Task 6 (occupancy flattens) |
| Risks — regenerate corpus, check 3 predictions | Task 7 |

No gaps.

**Type consistency:** `crowdingFromHeat`, `shouldEquilibrate`, `calibrateConcentrationLimit`, `OSMOTIC_EQUILIBRIUM_CONTRACT`, `ENERGY_WEIGHT`, `FEASIBILITY_WEIGHT`, `osmosisConcentrationLimit` are used identically in every task that references them. Row shape `{...row, osmosis, crowding}` is produced in Task 4 and consumed by Task 4's `finalizeCandidate` change and Task 6's `spread()` helper.

**Known risk in Task 4, flagged for the implementer:** control trials bypass `selectLicensedTrial` entirely (they call `scoreTrial` directly at the main loop, around `:830`), so control rows will have `osmosis: null`. `finalizeCandidate` must tolerate that — hence `row.osmosis ?? null` rather than a bare read. Task 2's third test (`still reports osmosis as a diagnostic field`) checks `report.candidates[0]`, which is a shortlisted candidate row, not a control row.
