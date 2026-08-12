# Quark Chamber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Semantic Valence Cyclotron an endogenous bond vocabulary — derived port-level bridge rules ("quarks") manufactured by gravity assist over the licensed graph, adjudicated by the semantic calculus, and proposed to a human for commit.

**Architecture:** A new pure module tree under `codex/core/pixelbrain/quark-chamber/` implements four layers: a structural slingshot generator (no scores), a frozen relation algebra, a semantic-calculus adjudicator built from `permission.ts` modulators, and a grant proposer that is structurally incapable of committing its own grant. The cyclotron's scoring function is **not modified** — derived bonds enter through the existing `0.40 · linkStrength` term at a decayed strength `λ · Π`, so no new scoring currency is introduced.

**Tech Stack:** Node ESM (`.js`), vitest 4, no new dependencies. Existing substrate: `codex/core/pixelbrain/semantic-valence-cyclotron.js`, `codex/core/pixelbrain/codebase-nuclei-bank.js`, `codex/core/semantic-calculus/permission.ts`, `codex/core/pixelbrain/grounding-index.js`, `codex/core/semantic/semantotopography.js`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-quark-chamber-design.md` (commit `6b642359`).
- Contract string for every new module and artifact: `PB-QUARK-CHAMBER-v1`.
- **`codex/core/pixelbrain/semantic-valence-cyclotron.js` scoring MUST NOT change.** No new term may be added to `energy` or `finalScore`. Derived bonds affect the score only through the `strength` value they carry into the existing `0.40 · linkStrength` term (spec §5.1).
- **v1 fits no weights.** PDR F9 sets `MIN_RESOLVED = 40`; the chamber has 20 authored bridges and 15 confined candidates. Tier 0 is a declared law, Tier 2 is a declared precedence. No calibrator is built (spec §7).
- **Depth 1 only.** `generateQuarkCandidates` MUST throw on `depth !== 1`. Depth > 1, the ω-sweep, and the persistent orbiting population are out of scope (spec §7).
- **F10 — no self-scored pressure.** No pressure value may be authored by the candidate it ranks or by the module that proposed it. Confinement (≥2 witnesses) gates *emission*, never ranking (spec §6 Layer 1).
- **F2a — permission monotonicity.** Every pressure source is a `Modulator` over `ModulatableState` composed through `applyModulation`. The chamber never passes a `lawGrant` for its own candidates.
- Every evidence artifact is checksummed with `sha256Hex` from `codex/core/immunity/cleri-probe/canonical-report.js` and records the SHA-256 of the pre-registration document it answers.
- Pre-registration is committed **before** the run it governs. Never write a prereg after seeing a result.
- Validators MUST reject non-finite input, never coerce it.
- Run tests with `npx vitest run <path>`.
- **Any script whose import graph reaches `permission.ts` must be run with `npx tsx`, not `node`.** Verified 2026-08-12 on Node v20.20.2: `import('./codex/core/semantic-calculus/permission.ts')` fails with `ERR_UNKNOWN_FILE_EXTENSION` under plain `node`, and succeeds under `tsx` v4.22.4. Vitest is unaffected (Vite transforms TypeScript). This applies to `scripts/quark-chamber.mjs` (Task 9), which reaches `permission.ts` through `adjudicate.js`. Do not port `permission.ts` to JavaScript to dodge this — it is the law module, and duplicating it is how two versions of a law start to disagree.
- Determinism: all randomness comes from `mulberry32` (exported by `codebase-nuclei-bank.js`) seeded from an explicit `seed` argument. No `Math.random()`.

### Known-red baseline (measured 2026-08-12, before this plan)

`npx vitest run tests/codex/core/pixelbrain` → **4 files failed, 12 tests failed, 1321 passed, 2 skipped.**

Failures are in `bridge-corpus.test.js` (2), `calibration.test.js` (5), `grounding-index.test.js` (4), `phono-bond.test.js` (1) — all downstream of commit `f343f375`, which deliberately folded `corpusPMI` into the feasibility score and was committed red. **Task 1 fixes these.** Do not begin Task 2 until Task 1 is green, because Layer 2's Tier-0 `contradiction` source is exactly the false-friend detector these tests protect.

## File Structure

| file | responsibility |
|---|---|
| `codex/core/pixelbrain/concept-chemistry.js` | **modified (Task 1).** `relationScore` gains coverage weighting and a floor-robust aggregate. |
| `codex/core/pixelbrain/quark-chamber/slingshot.js` | **new.** Pure structural generator. Port licensing, directed edge list, depth-1 gravity assist, confinement law. Emits candidates with **no score**. |
| `codex/core/pixelbrain/quark-chamber/configuration-null.js` | **new.** Degree-matched bipartite double-edge-swap shuffle preserving per-atom and per-port marginals. |
| `codex/core/pixelbrain/quark-chamber/relation-algebra.js` | **new.** Frozen `DECLARED_COMPOSITIONS` table, `composeRelation`, `censusCompositions`, `permuteDeclaredCompositions`. |
| `codex/core/pixelbrain/quark-chamber/relay-strength.js` | **new.** `relayStrength(λ, Π)`, authored-strength bracket constants. |
| `codex/core/pixelbrain/quark-chamber/adjudicate.js` | **new.** Layer 2. Pressure-source registry with named producers, three modulators, `adjudicateQuark`. |
| `codex/core/pixelbrain/quark-chamber/grant.js` | **new.** Layer 3. `proposeQuarkGrant`, append-only F8a outcome ledger. |
| `scripts/quark-authored-recovery.mjs` | **new.** Falsifier 2 — hold out all 20 authored bridges, measure rediscovery vs the degree-matched null. |
| `scripts/quark-confinement-null.mjs` | **new.** Falsifier 1 — 200-shuffle configuration null over 4 declared statistics, Bonferroni-corrected. |
| `scripts/sweep-relay-lambda.mjs` | **new.** Derives λ from its measured bracket; aborts if the bracket is empty. |
| `scripts/quark-permuted-algebra.mjs` | **new.** Falsifier 4 — permuted-relation-algebra control. |
| `scripts/quark-chamber.mjs` | **new.** CLI: `--propose`, `--pending`, `--resolve`. |
| `docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md` | **new.** All four falsifiers, statistics and thresholds declared in advance. |

Tests mirror each module at `tests/codex/core/pixelbrain/quark-chamber/<name>.test.js`.

---

## Deviations from the spec (read before Task 1)

Three places where the spec as written cannot be implemented literally. Each is a judgement call made while planning; a reviewer may overrule any of them.

**D1 — The "15-cell relation table" (§7) would violate F10.** The spec's Tier-0 table is derived from a census of the same candidates it gates: the candidate authors its own pressure value. This plan instead freezes `DECLARED_COMPOSITIONS` as the **47 compositions measured on the unmodified full bank**, committed as a constant with a checksum, and states openly that **on the unmodified full bank this gate absorbs zero candidates by construction**. It becomes load-bearing under the holdout (Task 3), the configuration null (Task 5), the permuted control (Task 10), and any depth > 1. Declaring that vacuity is mandatory — an unstated always-passing gate is this repository's named pathology (`project-checks-that-cannot-fail`).

**D2 — Every derived quark carries relation `relays`.** The spec's §5.1 introduces `relays` for `satisfies∘satisfies` but leaves `satisfies ∘ X` ambiguous between identity (`→ X`) and relay. Inheriting `X` would let a derived bond wear an authored relation's label. This plan gives *all* derived quarks the relation `relays`; the composition's information lives in `Π strength`, not in the label. `relays` is absent from the authored registry, so `relays ∘ *` is undeclared and long chains die without a special rule, as §5.1 requires.

**D3 — Task 1 is not in the spec.** The spec assumes a working false-friend detector. It is currently inverted (see Task 1). Layer 2 cannot be built on it. Fixing it first was an explicit instruction from the user.

**D4 — the §4.1 / §5 evidence run is split across Tasks 5 and 6, not done first.** Spec §10 asks for those measurements as "Task 1 … before any chamber code is written." That is not executable: both are measurements *of* the slingshot's output, so the generator is the instrument and must exist first. The plan therefore builds the generator (Task 2) with the published values as exact regression assertions, then reproduces §4.1 as a checksummed run in Task 5 and §5 in Task 6. Nothing is measured before it is pinned.

**Refuted, do not re-propose.** Spec §3.1 killed **endpoint-pair generality** ("how many new atom pairs does this rule unlock") — it equals `offerers(o) × seekers(s)` exactly in 83 of 89 cases, `r = 0.987` with the degree product, and it is authored by the graph the ranker is building, which F10 forbids. No task here ranks candidates by unlocked pairs, degree, or hub proximity. If a reviewer suggests adding one, this is the reason not to.

---

## Shared test fixtures

Repeated in full in each task that needs them — do not factor them into a helper other tasks cannot see.

### `TOY_BANK` — hand-verifiable confinement

```js
const ATOM = (id, offers, seeks) => ({
  id,
  label: `${id} test atom`,
  domain: 'synthesis',
  offers,
  seeks,
  traits: [],
  inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding: 0.8,
});

// A -> W1 -> B and A -> W2 -> B, both hops by exact match.
// Slingshot yields exactly one candidate rule: 'p-a' -> 'p-w', witnesses [W1, W2].
const TOY_BANK = [
  ATOM('atom-a', ['p-a'], []),
  ATOM('way-1', ['p-w'], ['p-a']),
  ATOM('way-2', ['p-w'], ['p-a']),
  ATOM('atom-b', ['p-b'], ['p-w']),
];
const TOY_BRIDGES = [];
```

### `FULL_BANK` — the measured substrate

```js
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
// FULL_ATOMS.length === 56, FULL_BRIDGES.length === 20
```

### Verified reference values

Reproduced from the working tree on 2026-08-12. Use these as exact regression assertions.

| statistic | ritual bank (44 atoms, 8 bridges) | full bank (56 atoms, 20 bridges) |
|---|---|---|
| directed licensed port-edges | 98 | 191 |
| depth-1 candidate rules | 89 | 169 |
| witness multiplicity | `{1: 88, 2: 1}` | `{1: 154, 2: 14, 3: 1}` |
| confined (≥2 witnesses) | 1 | 15 |
| max waypoints | 2 | 3 |
| distinct compositions | — | 47 |
| rules with `satisfies∘satisfies` | — | 96 |
| compositions with `satisfies` on neither side | — | 15 |
| authored bridge strength range | — | 0.78 … 0.94 |

---

### Task 1: Repair the inverted false-friend detector

Commit `f343f375` folded `corpusPMI` into the feasibility score and was committed deliberately red, leaving the decision open: *"Either the CAL-001 invariants get recalibrated for the new weights and the false-friend inversion is fixed, or the fold is reverted."* This task fixes it. The fold is kept — it is what flipped the null-substrate attack from +0.021 to −0.157 — and the inversion is repaired at its measured root cause.

**Root cause, measured 2026-08-12** (`synthesize` over the 8-document test corpus in `tests/codex/core/pixelbrain/grounding-index.test.js`):

| | attested pairs | meanPMI | signal | `relation` | feasibility |
|---|---|---|---|---|---|
| real correspondence | 25 | −2.4272 | REPULSION | 0.0053 | 0.1478 |
| false friend | 6 | +2.4717 | ATTRACTION | 0.9929 | 0.5187 |

`relation` is 86.1% of the false friend's score. Two defects compound:

1. **Coverage asymmetry.** `conceptPMI` skips pairs where `pmiPair` returns `null` (token unattested). The false friend's `latent`, `embedding`, `neural`, `dense`, `vector` vanish from the denominator, leaving 6 surviving pairs that all co-occur. Unattested tokens cost nothing; attested-but-never-together tokens are floored at `PMI_FLOOR` and cost a great deal. **A concept built from words the corpus has never heard outscores one built from words it knows but does not associate.**
2. **Floor outlier domination.** The mean over 25 pairs is dragged to −2.43 by 8 floored pairs. An arithmetic mean over a distribution with an arbitrary floor is not robust.

The repair is *derived, not fitted*: scale confidence by coverage, and aggregate with a floor-robust statistic. No weight is tuned against the failing tests.

**Files:**
- Modify: `codex/core/pixelbrain/grounding-index.js` (`conceptPMI` — add coverage fields)
- Modify: `codex/core/pixelbrain/concept-chemistry.js` (`relationScore`)
- Test: `tests/codex/core/pixelbrain/grounding-index.test.js` (add the missing property test)
- Test: `tests/codex/core/pixelbrain/calibration.test.js` (recalibrate frozen constants)

**Interfaces:**
- Consumes: nothing.
- Produces: `conceptPMI` result gains `crossPairs: number` (size of the full token cross-product, excluding self-pairs) and `coverage: number` (`pairs / crossPairs`, `0` when `crossPairs === 0`). `relationScore(pmi)` returns `{relation: number, basis: string, coverage: number}`.

- [ ] **Step 1: Write the failing test that should have existed**

This is the property nobody tested, which is why the inversion shipped. Add to `tests/codex/core/pixelbrain/grounding-index.test.js` inside the `CRITICAL: false friend discrimination` describe block:

```js
it('does not reward ignorance: an unattested pair cannot outscore an attested co-occurring pair', () => {
  // Every token attested AND co-occurring in the corpus.
  const known = synthesize({
    a: 'sealed packet canonical serialization',
    b: 'checksum content-addressed identity',
    product: 'content-addressed sealed packet',
    index: idx,
  });

  // Not one token of `b` appears anywhere in the corpus.
  const ignorant = synthesize({
    a: 'sealed packet canonical serialization',
    b: 'zzyzx quixotry brillig slithy toves',
    product: 'sealed zzyzx equivalence',
    index: idx,
  });

  expect(ignorant.feasibility).toBeLessThan(known.feasibility);
});

it('reports coverage so a low-evidence pair cannot claim a confident signal', () => {
  const pmi = conceptPMI(idx, 'checksum content-addressed hash', 'dense latent vector embedding neural');
  expect(pmi.crossPairs).toBeGreaterThan(pmi.pairs);
  expect(pmi.coverage).toBeLessThan(0.5);
  expect(relationScore(pmi).relation).toBeLessThan(0.75);
});
```

Add `conceptPMI` and `relationScore` to the file's imports if absent.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/codex/core/pixelbrain/grounding-index.test.js -t "does not reward ignorance"
npx vitest run tests/codex/core/pixelbrain/grounding-index.test.js -t "reports coverage"
```

Expected: both FAIL. The first because the ignorant pair currently scores higher; the second because `crossPairs`/`coverage` do not exist (`undefined`).

- [ ] **Step 3: Add coverage accounting to `conceptPMI`**

In `codex/core/pixelbrain/grounding-index.js`, inside `conceptPMI`, count the full cross-product and return it. Replace the return object and add a counter:

```js
export function conceptPMI(index, conceptA, conceptB) {
  const toksA = [...new Set(tokenize(conceptA))];
  const toksB = [...new Set(tokenize(conceptB))];
  let sum = 0, pairs = 0, attractive = 0, repulsive = 0, floored = 0;
  let crossPairs = 0;
  const observed = [];
  for (const ta of toksA) {
    for (const tb of toksB) {
      if (ta === tb) continue; // skip self-pairs
      crossPairs += 1;
      const r = pmiPair(index, ta, tb);
      if (r.pmi === null) continue; // unattested pair → no signal, but it still counted above
      observed.push(r.pmi);
      sum += r.pmi;
      pairs++;
      if (r.pmi < 0) {
        repulsive++;
        if (r.note && r.note.startsWith('never')) floored++;
      } else {
        attractive++;
      }
    }
  }
  const meanPMI = pairs === 0 ? 0 : sum / pairs;
  const sorted = [...observed].sort((a, b) => a - b);
  const medianPMI = sorted.length === 0
    ? 0
    : (sorted.length % 2 === 1
      ? sorted[(sorted.length - 1) / 2]
      : (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2);
  const signal = meanPMI < -0.5 ? 'REPULSION' : meanPMI > 0.5 ? 'ATTRACTION' : 'NEUTRAL';
  return {
    meanPMI: round4(meanPMI),
    medianPMI: round4(medianPMI),
    crossPairs,
    coverage: crossPairs === 0 ? 0 : round4(pairs / crossPairs),
    pairs,
    attractive,
    repulsive,
    flooredNeverCooccur: floored,
    signal,
  };
}
```

`meanPMI` and `signal` keep their exact former values, so every existing consumer of those two fields is unaffected.

- [ ] **Step 4: Make `relationScore` coverage-weighted and floor-robust**

In `codex/core/pixelbrain/concept-chemistry.js`, replace `relationScore`:

```js
/**
 * REPAIR 4 — the ignorance reward.
 *
 * Measured 2026-08-12: a false friend built from unattested tokens scored
 * relation 0.9929 while a real correspondence scored 0.0053, inverting the
 * property this channel exists to provide. Two causes, both fixed here.
 *
 * (1) COVERAGE. `conceptPMI` drops unattested pairs, so a pair the corpus
 *     knows nothing about arrives looking unanimous. Confidence is now scaled
 *     by how much of the token cross-product was actually observed: an
 *     unobserved pair pulls toward the neutral 0.5, it does not vanish.
 * (2) ROBUSTNESS. The mean is dominated by `PMI_FLOOR` outliers — 8 floored
 *     pairs dragged a 25-pair mean to -2.43. The median is used for the
 *     direction; `neverFraction` still applies the floored-pair penalty, so
 *     never-co-occurrence is punished once rather than twice.
 *
 * Derived, not fitted: no constant here was chosen by running the tests.
 * Coverage is a fraction, the median is a fraction-free order statistic, and
 * 0.5 is the pre-existing neutral point.
 */
export function relationScore(pmi) {
  if (!pmi || !Number.isFinite(pmi.meanPMI) || pmi.pairs === 0) {
    // No attested token pairs is absence of evidence, not evidence of repulsion.
    return { relation: 0.5, basis: 'NO_SIGNAL', coverage: 0 };
  }
  const direction = Number.isFinite(pmi.medianPMI) ? pmi.medianPMI : pmi.meanPMI;
  const centred = (Math.tanh(direction) + 1) / 2;
  const neverFraction = pmi.flooredNeverCooccur / Math.max(1, pmi.pairs);
  const coverage = Number.isFinite(pmi.coverage) ? pmi.coverage : 1;
  // Shrink toward neutral in proportion to unobserved evidence.
  const confident = 0.5 + (centred - 0.5) * coverage;
  const relation = Math.max(0, Math.min(1, confident * (1 - neverFraction)));
  return { relation, basis: pmi.signal ?? 'NEUTRAL', coverage };
}
```

- [ ] **Step 5: Run the new tests and the false-friend test**

```bash
npx vitest run tests/codex/core/pixelbrain/grounding-index.test.js
```

Expected: `does not reward ignorance`, `reports coverage`, and `real correspondence scores higher than false friend` all PASS.

If `real correspondence scores higher than false friend` still fails, **stop and report the measured numbers** — do not tune a constant to make it pass. The repair is derived; if the derivation is wrong the derivation must change, not its coefficients. `project-checks-that-cannot-fail` and `feedback-measure-dont-rationalize` both apply.

- [ ] **Step 6: Recalibrate the CAL-001 frozen constants**

The calibration registry froze feasibility values under v1 weights. They are now stale by construction, not wrong. Run:

```bash
npx vitest run tests/codex/core/pixelbrain/calibration.test.js
```

For each failure, update the **recorded** constant in the calibration registry to the value produced under `WEIGHTS_V2`, and add a comment naming this task and the date. Do **not** change an assertion's *direction* (e.g. `toBeGreaterThan` → `toBeLessThan`) — a flipped invariant is a refutation, not a recalibration. If an invariant's direction no longer holds, stop and report it.

- [ ] **Step 7: Run the whole pixelbrain suite**

```bash
npx vitest run tests/codex/core/pixelbrain
```

Expected: **0 failed.** Baseline was 12 failed / 1321 passed. Any remaining failure must be reported with its output, never filed under "pre-existing".

- [ ] **Step 8: Commit**

```bash
git add codex/core/pixelbrain/grounding-index.js \
        codex/core/pixelbrain/concept-chemistry.js \
        tests/codex/core/pixelbrain/grounding-index.test.js \
        tests/codex/core/pixelbrain/calibration.test.js
git commit -m "fix(concept-chemistry): repair the inverted false-friend detector

relationScore rewarded ignorance: unattested token pairs were dropped from
conceptPMI's denominator while attested-but-never-co-occurring pairs were
floored and penalised, so a false friend built from words the corpus has
never seen scored 0.9929 against a real correspondence's 0.0053.

Coverage now shrinks the signal toward neutral in proportion to unobserved
evidence, and the median replaces the mean so PMI_FLOOR outliers cannot
dominate. Closes the 12 tests left red by f343f375.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: Slingshot generator (Layer 1, pure and structural)

Depth-1 gravity assist over the licensed graph. **Emits no scores** — confinement gates emission only (F10).

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/slingshot.js`
- Test: `tests/codex/core/pixelbrain/quark-chamber/slingshot.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `QUARK_CHAMBER_CONTRACT: 'PB-QUARK-CHAMBER-v1'`
  - `buildBridgeMap(bridges: {from,to,relation,strength}[]) => Map<string, object>`
  - `licenseFor(offer: string, seek: string, bridgeMap: Map) => {relation: string, strength: number} | null`
  - `licensedPortEdges(blueprints, bridges) => ReadonlyArray<{fromAtomId, toAtomId, offer, seek, relation, strength}>` sorted deterministically
  - `generateQuarkCandidates(blueprints, bridges, {depth = 1, confinementMin = 2}) => ReadonlyArray<{from, to, witnesses: string[], compositions: string[]}>` sorted by `` `${from}|${to}` ``

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/slingshot.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  QUARK_CHAMBER_CONTRACT,
  buildBridgeMap,
  licenseFor,
  licensedPortEdges,
  generateQuarkCandidates,
} from '../../../../../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const ATOM = (id, offers, seeks) => ({
  id,
  label: `${id} test atom`,
  domain: 'synthesis',
  offers,
  seeks,
  traits: [],
  inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding: 0.8,
});

const TOY_BANK = [
  ATOM('atom-a', ['p-a'], []),
  ATOM('way-1', ['p-w'], ['p-a']),
  ATOM('way-2', ['p-w'], ['p-a']),
  ATOM('atom-b', ['p-b'], ['p-w']),
];

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('slingshot (PB-QUARK-CHAMBER-v1)', () => {
  it('declares its contract', () => {
    expect(QUARK_CHAMBER_CONTRACT).toBe('PB-QUARK-CHAMBER-v1');
  });

  describe('licensing', () => {
    it('licenses an exact port match as satisfies at strength 1', () => {
      expect(licenseFor('p-a', 'p-a', buildBridgeMap([]))).toEqual({ relation: 'satisfies', strength: 1 });
    });

    it('licenses an authored bridge at its own relation and strength', () => {
      const map = buildBridgeMap([{ from: 'p-a', to: 'p-b', relation: 'carries', strength: 0.9 }]);
      expect(licenseFor('p-a', 'p-b', map)).toEqual({ relation: 'carries', strength: 0.9 });
    });

    it('licenses nothing otherwise', () => {
      expect(licenseFor('p-a', 'p-b', buildBridgeMap([]))).toBeNull();
    });
  });

  describe('confinement law', () => {
    it('emits a candidate witnessed by two independent waypoints', () => {
      const candidates = generateQuarkCandidates(TOY_BANK, [], {});
      expect(candidates).toHaveLength(1);
      expect(candidates[0].from).toBe('p-a');
      expect(candidates[0].to).toBe('p-w');
      expect(candidates[0].witnesses).toEqual(['way-1', 'way-2']);
      expect(candidates[0].compositions).toEqual(['satisfies|satisfies']);
    });

    it('suppresses a candidate with only one waypoint', () => {
      const single = TOY_BANK.filter((a) => a.id !== 'way-2');
      expect(generateQuarkCandidates(single, [], {})).toHaveLength(0);
    });

    it('counts one waypoint once however many routes pass through it', () => {
      // Two source atoms both reach atom-b through the SAME waypoint. That is one
      // witness, not two — independence is per waypoint atom, so this stays
      // suppressed. Getting this wrong would let a single hub manufacture its own
      // corroboration.
      const oneHub = [
        ATOM('atom-a1', ['p-a'], []),
        ATOM('atom-a2', ['p-a'], []),
        ATOM('way-1', ['p-w'], ['p-a']),
        ATOM('atom-b', ['p-b'], ['p-w']),
      ];
      expect(generateQuarkCandidates(oneHub, [], { confinementMin: 1 })).toHaveLength(1);
      expect(generateQuarkCandidates(oneHub, [], { confinementMin: 1 })[0].witnesses).toEqual(['way-1']);
      expect(generateQuarkCandidates(oneHub, [], {})).toHaveLength(0);
    });

    it('never emits a rule that is already licensed', () => {
      const bridged = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
      expect(generateQuarkCandidates(TOY_BANK, bridged, {})).toHaveLength(0);
    });

    it('emits no score of any kind (F10)', () => {
      const [candidate] = generateQuarkCandidates(TOY_BANK, [], {});
      expect(Object.keys(candidate).sort()).toEqual(['compositions', 'from', 'to', 'witnesses']);
    });
  });

  describe('v1 scope', () => {
    it('refuses any depth but 1', () => {
      expect(() => generateQuarkCandidates(TOY_BANK, [], { depth: 2 })).toThrow(/depth/i);
    });
  });

  describe('measured full-bank reference values', () => {
    it('reproduces 56 atoms, 20 bridges and 191 directed licensed edges', () => {
      expect(FULL_ATOMS).toHaveLength(56);
      expect(FULL_BRIDGES).toHaveLength(20);
      expect(licensedPortEdges(FULL_ATOMS, FULL_BRIDGES)).toHaveLength(191);
    });

    it('reproduces 169 candidate rules, multiplicity {1:154, 2:14, 3:1}, 15 confined', () => {
      const all = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 });
      expect(all).toHaveLength(169);

      const multiplicity = {};
      for (const c of all) multiplicity[c.witnesses.length] = (multiplicity[c.witnesses.length] ?? 0) + 1;
      expect(multiplicity).toEqual({ 1: 154, 2: 14, 3: 1 });

      expect(generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {})).toHaveLength(15);
    });

    it('reproduces the ritual bank: 98 edges, 89 rules, 1 confined', () => {
      expect(licensedPortEdges(ATOM_BLUEPRINTS, BRIDGE_RULES)).toHaveLength(98);
      expect(generateQuarkCandidates(ATOM_BLUEPRINTS, BRIDGE_RULES, { confinementMin: 1 })).toHaveLength(89);
      expect(generateQuarkCandidates(ATOM_BLUEPRINTS, BRIDGE_RULES, {})).toHaveLength(1);
    });

    it('is deterministic across repeated calls', () => {
      const a = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {});
      const b = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, {});
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/slingshot.test.js
```

Expected: FAIL — `Failed to resolve import ... slingshot.js`.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/slingshot.js`:

```js
/**
 * QUARK CHAMBER — Layer 1: the slingshot generator.
 *
 * A quark is a DERIVED bridge rule, manufactured by gravity assist over the
 * licensed graph rather than authored by a human. Atom A offers port `o`;
 * waypoint C seeks `s1` and offers `o2`; atom B seeks `s2`. If A—C and C—B are
 * both licensed, A has borrowed C's connectivity to reach B. The candidate
 * quark asks whether that borrowing GENERALISES: does `o -> s2` license
 * directly, without C?
 *
 * CONFINEMENT IS A CANDIDACY LAW, NOT A PRESSURE VALUE. A rule witnessed by a
 * single waypoint is an anecdote; >=2 independent waypoints are required to
 * EMIT. Because PDR F10 forbids the proposer from scoring its own output,
 * nothing in this module returns a score, a rank, or a strength for a
 * candidate. Ranking happens in Layer 2, from producers named elsewhere.
 *
 * Everything here is pure and structural: no vectors, no corpus, no I/O.
 */

export const QUARK_CHAMBER_CONTRACT = 'PB-QUARK-CHAMBER-v1';

export function buildBridgeMap(bridges) {
  if (!Array.isArray(bridges)) throw new TypeError('buildBridgeMap(bridges) requires an array');
  return new Map(bridges.map((rule) => [`${rule.from}|${rule.to}`, rule]));
}

/** Exact match is `satisfies` at full strength; otherwise an authored bridge, or nothing. */
export function licenseFor(offer, seek, bridgeMap) {
  if (offer === seek) return { relation: 'satisfies', strength: 1 };
  const bridge = bridgeMap.get(`${offer}|${seek}`);
  if (!bridge) return null;
  return { relation: bridge.relation, strength: bridge.strength };
}

/** Mirrors semantic-valence-cyclotron.js:connectionBetween — inhibition is by domain. */
function inhibited(from, to) {
  return (from.inhibits ?? []).includes(to.domain) || (to.inhibits ?? []).includes(from.domain);
}

export function licensedPortEdges(blueprints, bridges) {
  if (!Array.isArray(blueprints)) throw new TypeError('licensedPortEdges(blueprints, bridges) requires arrays');
  const bridgeMap = buildBridgeMap(bridges);
  const edges = [];
  for (const from of blueprints) {
    for (const to of blueprints) {
      if (from.id === to.id) continue;
      if (inhibited(from, to)) continue;
      for (const offer of from.offers ?? []) {
        for (const seek of to.seeks ?? []) {
          const license = licenseFor(offer, seek, bridgeMap);
          if (!license) continue;
          edges.push(Object.freeze({
            fromAtomId: from.id,
            toAtomId: to.id,
            offer,
            seek,
            relation: license.relation,
            strength: license.strength,
          }));
        }
      }
    }
  }
  edges.sort((a, b) => (
    `${a.fromAtomId}|${a.toAtomId}|${a.offer}|${a.seek}`
      .localeCompare(`${b.fromAtomId}|${b.toAtomId}|${b.offer}|${b.seek}`)
  ));
  return Object.freeze(edges);
}

export function generateQuarkCandidates(blueprints, bridges, { depth = 1, confinementMin = 2 } = {}) {
  if (depth !== 1) {
    throw new RangeError(
      `quark chamber v1 supports depth 1 only (received ${depth}). Depth > 1 requires its own `
      + 'configuration null before its counts mean anything — see the design, section 9.',
    );
  }
  if (!Number.isInteger(confinementMin) || confinementMin < 1) {
    throw new RangeError('confinementMin must be an integer >= 1');
  }

  const bridgeMap = buildBridgeMap(bridges);
  const edges = licensedPortEdges(blueprints, bridges);

  const incoming = new Map();
  const outgoing = new Map();
  for (const edge of edges) {
    if (!outgoing.has(edge.fromAtomId)) outgoing.set(edge.fromAtomId, []);
    outgoing.get(edge.fromAtomId).push(edge);
    if (!incoming.has(edge.toAtomId)) incoming.set(edge.toAtomId, []);
    incoming.get(edge.toAtomId).push(edge);
  }

  const candidates = new Map();
  for (const waypoint of blueprints) {
    const arrivals = incoming.get(waypoint.id) ?? [];
    const departures = outgoing.get(waypoint.id) ?? [];
    for (const arrival of arrivals) {
      for (const departure of departures) {
        if (arrival.fromAtomId === departure.toAtomId) continue; // A must differ from B
        const from = arrival.offer;
        const to = departure.seek;
        if (licenseFor(from, to, bridgeMap)) continue; // already licensed — not new
        const key = `${from}|${to}`;
        if (!candidates.has(key)) {
          candidates.set(key, { from, to, witnesses: new Set(), compositions: new Set() });
        }
        const candidate = candidates.get(key);
        // Independence is per WAYPOINT ATOM: one atom offering several routes is one witness.
        candidate.witnesses.add(waypoint.id);
        candidate.compositions.add(`${arrival.relation}|${departure.relation}`);
      }
    }
  }

  const confined = [];
  for (const candidate of candidates.values()) {
    if (candidate.witnesses.size < confinementMin) continue;
    confined.push(Object.freeze({
      from: candidate.from,
      to: candidate.to,
      witnesses: Object.freeze([...candidate.witnesses].sort()),
      compositions: Object.freeze([...candidate.compositions].sort()),
    }));
  }
  confined.sort((a, b) => `${a.from}|${a.to}`.localeCompare(`${b.from}|${b.to}`));
  return Object.freeze(confined);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/slingshot.test.js
```

Expected: PASS, all cases. The full-bank reference values (191 / 169 / `{1:154,2:14,3:1}` / 15) and the ritual values (98 / 89 / 1) were reproduced from the working tree on 2026-08-12; if any differs, the substrate changed and **that is the finding** — report it rather than editing the expected numbers.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/slingshot.js \
        tests/codex/core/pixelbrain/quark-chamber/slingshot.test.js
git commit -m "feat(quark-chamber): depth-1 slingshot generator with the confinement law

Reproduces the design's measured values exactly: 191 directed licensed edges,
169 depth-1 candidate rules, multiplicity {1:154, 2:14, 3:1}, 15 confined on
the full bank; 98/89/1 on the ritual bank.

Emits no scores — confinement gates emission only, per PDR F10.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: Pre-registration, then the authored-bridge holdout (Falsifier 2)

The spec calls this *"the test most likely to kill the design outright."* It runs now, before the algebra, λ, adjudication, and grant machinery exist, so a refutation costs three tasks instead of eleven. It needs only Layer 1.

**Files:**
- Create: `docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md`
- Create: `scripts/quark-authored-recovery.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/authored-recovery.test.js`

**Interfaces:**
- Consumes: `generateQuarkCandidates`, `licensedPortEdges` from Task 2.
- Produces: `runAuthoredRecovery({blueprints, bridges, confinementMin}) => {heldOut: number, recovered: number, recall: number, recoveredPairs: string[], candidateCount: number}` exported from `scripts/quark-authored-recovery.mjs`.

- [ ] **Step 1: Write and commit the pre-registration**

This must be committed **before** the measurement script runs. Create `docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md`:

```markdown
# PREREG — Quark Chamber v1 (PB-QUARK-CHAMBER-v1)

**Written:** 2026-08-12, before any measurement in this plan was run.
**Design:** docs/superpowers/specs/2026-08-12-quark-chamber-design.md (commit 6b642359)

Four falsifiers. Each can kill the design. Statistics, thresholds and the
multiple-comparison correction are fixed here and may not be changed after a
result is seen. Any statistic added later is a new prereg, not an amendment.

## Correction

Four statistics per family, alpha = 0.05, Bonferroni m = 4, so the
per-statistic threshold is **p < 0.0125**.

Empirical p-values use the conservative estimator
`p = (1 + #{null >= real}) / (1 + N)`, never `#{null >= real} / N`.
This differs slightly from the exploratory p = 0.030 quoted in design
section 4.1; the design's figure is exploratory and is not a result.

## F1 — Confinement exceeds the degree-matched configuration null

- Substrate: full bank, 56 atoms, 20 authored bridges.
- Null: bipartite double-edge-swap preserving per-atom offer/seek counts AND
  per-port global offer/seek frequencies. N = 200 shuffles, seed 0x51554152.
- Statistics, declared in advance: `edges`, `rules`, `confined`, `maxWaypoints`.
- Threshold: >= 2 witnesses (fixed before this run).
- **Design fails** if `confined` does not exceed the null at p < 0.0125.
- Note in advance: the `rules` statistic is expected to run the OTHER way
  (the real bank emits FEWER distinct candidates than chance). Any claim that
  the slingshot "finds many new rules" is refuted by this table, not supported
  by it. The predicted signature is concentration, not yield.

## F2 — Authored-bridge recovery

- Hold out all 20 authored bridges. The graph becomes exact-match-only.
- Ask: does the generator rediscover the held-out (from-port, to-port) pairs?
- Statistic: `recall` = recovered / 20. Relation LABELS are authored and are
  NOT expected to be recovered; only the port pair counts.
- Control: the same holdout over 200 degree-matched shuffles.
- **Design fails** if real recall does not exceed the null at p < 0.0125.
- Declared in advance: recovery may be ZERO. Exact-match-only licensing may
  simply not reach the pairs a human bridged. That is a clean refutation of
  the claim that authored bridges are derivable, and it must be reported as
  one rather than reframed.

## F3 — Grant outcome predicate (F8a)

- Every committed quark must be markable `grant_was_wrong`.
- **Design fails** if any proposed grant cannot be resolved to one of
  `succeeded | regressed | needed_rework | grant_was_wrong`.
- A quark nobody can mark wrong is decorative prose.

## F4 — Novelty is not self-fulfilling

- Novelty is `1 - max similarity to constituent atoms`, so admitting ANY bond
  between distant ports raises it by construction.
- Control: permuted relation algebra — same count of admitted quarks, same
  lambda, `DECLARED_COMPOSITIONS` permuted across the composition universe.
- Statistics: two-sample Kolmogorov-Smirnov on shortlist molecule novelty, and
  a chi-square on verdict counts.
- **Design fails** if real and permuted algebras are indistinguishable
  (both p >= 0.0125). Then the algebra carries no information and the chamber
  is a noise injector.

## What no result here licenses

None of these tests establish that a quark is USEFUL. They establish that the
generator's output is not a degree artifact, that the algebra is not inert,
and that grants are falsifiable. Utility requires 40 resolved grants through
F8a and is explicitly out of scope for v1 (PDR F9, MIN_RESOLVED = 40).
```

Commit it alone, before anything measures anything:

```bash
git add docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
git commit -m "docs(prereg): quark chamber v1 falsifiers, thresholds fixed in advance

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/authored-recovery.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { runAuthoredRecovery } from '../../../../../scripts/quark-authored-recovery.mjs';

const ATOM = (id, offers, seeks) => ({
  id,
  label: `${id} test atom`,
  domain: 'synthesis',
  offers,
  seeks,
  traits: [],
  inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding: 0.8,
});

describe('authored-bridge recovery (Falsifier 2)', () => {
  it('recovers a bridge the exact-match graph can reach by two waypoints', () => {
    // With the bridge held out, p-a -> p-w must still be reachable via way-1 and way-2.
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('way-1', ['p-w'], ['p-a']),
      ATOM('way-2', ['p-w'], ['p-a']),
      ATOM('atom-b', ['p-b'], ['p-w']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
    const result = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(result.heldOut).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.recoveredPairs).toEqual(['p-a|p-w']);
  });

  it('reports zero recovery honestly when the graph cannot reach the pair', () => {
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('atom-b', ['p-b'], ['p-z']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-b', relation: 'carries', strength: 0.9 }];
    const result = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(result.heldOut).toBe(1);
    expect(result.recovered).toBe(0);
    expect(result.recall).toBe(0);
  });

  it('is deterministic', () => {
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('way-1', ['p-w'], ['p-a']),
      ATOM('way-2', ['p-w'], ['p-a']),
      ATOM('atom-b', ['p-b'], ['p-w']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
    const a = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    const b = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(a).toEqual(b);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/authored-recovery.test.js
```

Expected: FAIL — `Failed to resolve import ... quark-authored-recovery.mjs`.

- [ ] **Step 4: Write the implementation**

Create `scripts/quark-authored-recovery.mjs`:

```js
#!/usr/bin/env node

/**
 * FALSIFIER 2 — authored-bridge recovery.
 *
 * Hold out all authored bridges, leaving an exact-match-only graph, and ask
 * whether the slingshot rediscovers the port pairs a human wrote. Relation
 * LABELS are authored and are not expected to be recovered; only the pair.
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 * A recall of zero is a clean refutation and is reported as one.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-authored-recovery.json';

export function runAuthoredRecovery({ blueprints, bridges, confinementMin = 2 }) {
  const heldOutPairs = new Set(bridges.map((rule) => `${rule.from}|${rule.to}`));
  // The holdout graph: no authored bridges at all.
  const candidates = generateQuarkCandidates(blueprints, [], { confinementMin });
  const proposedPairs = new Set(candidates.map((c) => `${c.from}|${c.to}`));
  const recoveredPairs = [...heldOutPairs].filter((pair) => proposedPairs.has(pair)).sort();
  return {
    heldOut: heldOutPairs.size,
    recovered: recoveredPairs.length,
    recall: heldOutPairs.size === 0 ? 0 : recoveredPairs.length / heldOutPairs.size,
    recoveredPairs,
    candidateCount: candidates.length,
  };
}

function main() {
  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const result = runAuthoredRecovery({ blueprints, bridges, confinementMin: 2 });

  console.log('Falsifier 2 — authored-bridge recovery');
  console.log(`  atoms            ${blueprints.length}`);
  console.log(`  held out         ${result.heldOut}`);
  console.log(`  candidates       ${result.candidateCount}`);
  console.log(`  recovered        ${result.recovered}`);
  console.log(`  recall           ${result.recall.toFixed(4)}`);
  if (result.recoveredPairs.length) console.log(`  pairs            ${result.recoveredPairs.join(', ')}`);
  if (result.recovered === 0) {
    console.log('\n  RECALL IS ZERO. Per the prereg this is a clean refutation of the claim');
    console.log('  that authored bridges are derivable by depth-1 gravity assist.');
    console.log('  Report it as such. Do not reframe it.');
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    falsifier: 'F2-authored-bridge-recovery',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    substrate: { atoms: blueprints.length, authoredBridges: bridges.length },
    result,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`\n  written → ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/authored-recovery.test.js
```

Expected: PASS.

- [ ] **Step 6: Run the falsifier on the full bank**

```bash
node scripts/quark-authored-recovery.mjs
```

**Record the printed recall verbatim in your report to the reviewer, whatever it is.** Then:

- If `recovered > 0`: continue to Task 4. The prereg's F2 null comparison needs the degree-matched shuffler, which Task 4 builds, so it is completed in **Task 5, Step 6**. Recovery is not established until that step runs.
- If `recovered === 0`: **STOP AND REPORT.** Do not proceed to Task 4. Per the prereg this is a refutation of the design's central claim. The reviewer decides whether the chamber continues on different grounds (e.g. as a novel-rule generator that does not claim to recover human judgement), and that decision changes the remaining tasks.

- [ ] **Step 7: Commit**

```bash
git add scripts/quark-authored-recovery.mjs \
        tests/codex/core/pixelbrain/quark-chamber/authored-recovery.test.js \
        docs/superpowers/evidence/2026-08-12-quark-authored-recovery.json
git commit -m "test(quark-chamber): falsifier 2 — authored-bridge recovery holdout

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Degree-matched configuration null

The design's section 3.2 records that `shuffleOffersSeeks` is **inert for topology** — it moves each atom's `(offers, seeks)` bundle as a unit, so the port-level graph is untouched and the atom-level graph is merely relabelled. A valid control for the nuclei ablation; useless here. This task builds the shuffle that actually randomises topology while holding degree fixed.

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/configuration-null.js`
- Test: `tests/codex/core/pixelbrain/quark-chamber/configuration-null.test.js`

**Interfaces:**
- Consumes: `mulberry32` from `codex/core/pixelbrain/codebase-nuclei-bank.js`; `generateQuarkCandidates` from Task 2.
- Produces: `degreeMatchedShuffle(blueprints, seed, {swapFactor = 10}) => blueprints[]` — new array, same atom ids and order, `offers`/`seeks` reassigned.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/configuration-null.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { degreeMatchedShuffle } from '../../../../../codex/core/pixelbrain/quark-chamber/configuration-null.js';
import { generateQuarkCandidates } from '../../../../../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { shuffleOffersSeeks, buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

const portCounts = (blueprints, field) => {
  const counts = new Map();
  for (const atom of blueprints) for (const port of atom[field] ?? []) {
    counts.set(port, (counts.get(port) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
};

describe('degree-matched configuration null', () => {
  it('preserves each atom offer and seek count', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x51554152);
    expect(shuffled).toHaveLength(FULL_ATOMS.length);
    for (let i = 0; i < FULL_ATOMS.length; i += 1) {
      expect(shuffled[i].id).toBe(FULL_ATOMS[i].id);
      expect(shuffled[i].offers).toHaveLength(FULL_ATOMS[i].offers.length);
      expect(shuffled[i].seeks ?? []).toHaveLength((FULL_ATOMS[i].seeks ?? []).length);
    }
  });

  it('preserves every port global offer and seek frequency', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x51554152);
    expect(portCounts(shuffled, 'offers')).toEqual(portCounts(FULL_ATOMS, 'offers'));
    expect(portCounts(shuffled, 'seeks')).toEqual(portCounts(FULL_ATOMS, 'seeks'));
  });

  it('never gives an atom the same port twice', () => {
    const shuffled = degreeMatchedShuffle(FULL_ATOMS, 0x7);
    for (const atom of shuffled) {
      expect(new Set(atom.offers).size).toBe(atom.offers.length);
      expect(new Set(atom.seeks ?? []).size).toBe((atom.seeks ?? []).length);
    }
  });

  it('is deterministic for a seed and different across seeds', () => {
    expect(degreeMatchedShuffle(FULL_ATOMS, 11)).toEqual(degreeMatchedShuffle(FULL_ATOMS, 11));
    expect(degreeMatchedShuffle(FULL_ATOMS, 11)).not.toEqual(degreeMatchedShuffle(FULL_ATOMS, 12));
  });

  it('actually moves topology — unlike shuffleOffersSeeks, which is inert for it', () => {
    const real = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 }).length;

    // The design's section 3.2: the bundle-preserving shuffle is an isomorphism
    // at the port level, so candidate counts are invariant under it.
    const inertCounts = [1, 2, 3, 4, 5].map((seed) => (
      generateQuarkCandidates(shuffleOffersSeeks(FULL_ATOMS, seed), FULL_BRIDGES, { confinementMin: 1 }).length
    ));
    expect(new Set(inertCounts)).toEqual(new Set([real]));

    // The degree-matched shuffle must not be invariant.
    const liveCounts = [1, 2, 3, 4, 5].map((seed) => (
      generateQuarkCandidates(degreeMatchedShuffle(FULL_ATOMS, seed), FULL_BRIDGES, { confinementMin: 1 }).length
    ));
    expect(new Set(liveCounts).size).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/configuration-null.test.js
```

Expected: FAIL — `Failed to resolve import ... configuration-null.js`.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/configuration-null.js`:

```js
/**
 * QUARK CHAMBER — the degree-matched configuration null.
 *
 * `codebase-nuclei-bank.js:shuffleOffersSeeks` moves each atom's (offers, seeks)
 * bundle as a UNIT. Licensing depends only on port names, so the port-level
 * graph is untouched and the atom-level graph is merely relabelled: an
 * isomorphism, under which every structural statistic is invariant BY
 * CONSTRUCTION. That is not a defect — for the nuclei ablation, where label,
 * domain, evidence and grounding stay put, it is a valid control. It is simply
 * inert for topology, and topology is what quarks are made of.
 *
 * This shuffle randomises the atom-port incidence while holding BOTH marginals
 * exactly: per-atom offer/seek counts and per-port global frequencies. It is a
 * bipartite double-edge swap — pick two incidences (a1,p1) and (a2,p2), and
 * exchange their ports when neither atom already holds the other's port. Degree
 * on both sides is preserved by the swap itself, so no rejection sampling over
 * degree sequences is needed.
 */

import { mulberry32 } from '../codebase-nuclei-bank.js';

function swapField(blueprints, field, random, swapFactor) {
  const incidences = [];
  const held = blueprints.map((atom) => new Set(atom[field] ?? []));
  blueprints.forEach((atom, atomIndex) => {
    for (const port of atom[field] ?? []) incidences.push({ atomIndex, port });
  });
  if (incidences.length < 2) return blueprints.map((atom) => [...(atom[field] ?? [])]);

  const attempts = swapFactor * incidences.length;
  for (let i = 0; i < attempts; i += 1) {
    const left = incidences[Math.floor(random() * incidences.length)];
    const right = incidences[Math.floor(random() * incidences.length)];
    if (left.atomIndex === right.atomIndex) continue;
    if (left.port === right.port) continue;
    if (held[left.atomIndex].has(right.port)) continue;  // would duplicate
    if (held[right.atomIndex].has(left.port)) continue;  // would duplicate

    held[left.atomIndex].delete(left.port);
    held[right.atomIndex].delete(right.port);
    held[left.atomIndex].add(right.port);
    held[right.atomIndex].add(left.port);
    const carried = left.port;
    left.port = right.port;
    right.port = carried;
  }
  return held.map((set) => [...set].sort());
}

export function degreeMatchedShuffle(blueprints, seed, { swapFactor = 10 } = {}) {
  if (!Array.isArray(blueprints)) throw new TypeError('degreeMatchedShuffle(blueprints, seed) requires an array');
  if (!Number.isFinite(seed)) throw new TypeError('degreeMatchedShuffle requires a finite seed');
  if (!Number.isInteger(swapFactor) || swapFactor < 1) throw new RangeError('swapFactor must be an integer >= 1');

  const random = mulberry32(seed);
  const offers = swapField(blueprints, 'offers', random, swapFactor);
  const seeks = swapField(blueprints, 'seeks', random, swapFactor);
  return blueprints.map((atom, index) => ({ ...atom, offers: offers[index], seeks: seeks[index] }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/configuration-null.test.js
```

Expected: PASS. The `shuffleOffersSeeks` invariance assertion is the design's section 3.2 claim turned into a regression test — if it fails, `shuffleOffersSeeks` changed and section 3.2 needs revisiting.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/configuration-null.js \
        tests/codex/core/pixelbrain/quark-chamber/configuration-null.test.js
git commit -m "feat(quark-chamber): degree-matched configuration null

Bipartite double-edge swap preserving per-atom offer/seek counts and per-port
global frequencies. Includes a regression test pinning the design's finding
that shuffleOffersSeeks is structurally inert for topology.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: Confinement null evidence run (Falsifier 1)

**Files:**
- Create: `scripts/quark-confinement-null.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/confinement-null.test.js`

**Interfaces:**
- Consumes: `generateQuarkCandidates`, `licensedPortEdges` (Task 2); `degreeMatchedShuffle` (Task 4).
- Produces: `runConfinementNull({blueprints, bridges, shuffles, seed, confinementMin}) => {real: Record<string, number>, stats: Record<string, {nullMean, nullSd, real, z, p}>}` where the statistic keys are exactly `edges`, `rules`, `confined`, `maxWaypoints`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/confinement-null.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { runConfinementNull } from '../../../../../scripts/quark-confinement-null.mjs';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('confinement configuration null (Falsifier 1)', () => {
  it('reports exactly the four pre-registered statistics', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    expect(Object.keys(out.stats).sort()).toEqual(['confined', 'edges', 'maxWaypoints', 'rules']);
  });

  it('measures the real bank at its known values', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    expect(out.real.edges).toBe(191);
    expect(out.real.rules).toBe(169);
    expect(out.real.confined).toBe(15);
    expect(out.real.maxWaypoints).toBe(3);
  });

  it('uses the conservative p estimator (1 + hits) / (1 + N)', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    for (const stat of Object.values(out.stats)) {
      // With N = 20 the smallest attainable p is 1/21; it can never be 0.
      expect(stat.p).toBeGreaterThanOrEqual(1 / 21);
      expect(stat.p).toBeLessThanOrEqual(1);
      expect(Number.isFinite(stat.z)).toBe(true);
    }
  });

  it('is deterministic for a seed', () => {
    const args = {
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 10, seed: 99, confinementMin: 2,
    };
    expect(runConfinementNull(args)).toEqual(runConfinementNull(args));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/confinement-null.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `scripts/quark-confinement-null.mjs`:

```js
#!/usr/bin/env node

/**
 * FALSIFIER 1 — does confinement exceed a degree-matched configuration null?
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 * Statistics fixed in advance: edges, rules, confined, maxWaypoints.
 * Bonferroni m = 4, alpha = 0.05, per-statistic threshold p < 0.0125.
 *
 * The predicted signature is CONCENTRATION, NOT YIELD: the real bank is
 * expected to emit FEWER distinct candidates than chance while emitting more
 * that are independently witnessed. The `rules` statistic running the other way
 * is a prediction of this design, not an embarrassment to it.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { generateQuarkCandidates, licensedPortEdges } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { degreeMatchedShuffle } from '../codex/core/pixelbrain/quark-chamber/configuration-null.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-confinement-null.json';
const STATISTICS = Object.freeze(['edges', 'rules', 'confined', 'maxWaypoints']);
const BONFERRONI_THRESHOLD = 0.05 / STATISTICS.length;

function measure(blueprints, bridges, confinementMin) {
  const all = generateQuarkCandidates(blueprints, bridges, { confinementMin: 1 });
  let confined = 0;
  let maxWaypoints = 0;
  for (const candidate of all) {
    if (candidate.witnesses.length >= confinementMin) confined += 1;
    maxWaypoints = Math.max(maxWaypoints, candidate.witnesses.length);
  }
  return {
    edges: licensedPortEdges(blueprints, bridges).length,
    rules: all.length,
    confined,
    maxWaypoints,
  };
}

export function runConfinementNull({ blueprints, bridges, shuffles, seed, confinementMin = 2 }) {
  if (!Number.isInteger(shuffles) || shuffles < 1) throw new RangeError('shuffles must be an integer >= 1');
  if (!Number.isFinite(seed)) throw new TypeError('seed must be finite');

  const real = measure(blueprints, bridges, confinementMin);
  const samples = Object.fromEntries(STATISTICS.map((name) => [name, []]));
  for (let i = 0; i < shuffles; i += 1) {
    const shuffled = degreeMatchedShuffle(blueprints, seed + i);
    const sample = measure(shuffled, bridges, confinementMin);
    for (const name of STATISTICS) samples[name].push(sample[name]);
  }

  const stats = {};
  for (const name of STATISTICS) {
    const values = samples[name];
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
    const sd = Math.sqrt(variance);
    const atLeast = values.filter((value) => value >= real[name]).length;
    stats[name] = {
      nullMean: Number(mean.toFixed(4)),
      nullSd: Number(sd.toFixed(4)),
      real: real[name],
      z: sd === 0 ? 0 : Number(((real[name] - mean) / sd).toFixed(4)),
      // Conservative estimator: p can never be reported as zero.
      p: Number(((1 + atLeast) / (1 + values.length)).toFixed(6)),
    };
  }
  return { real, stats, shuffles, confinementMin };
}

function main() {
  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const out = runConfinementNull({ blueprints, bridges, shuffles: 200, seed: 0x51554152, confinementMin: 2 });

  console.log('Falsifier 1 — degree-matched configuration null, 200 shuffles');
  console.log('  statistic       null mean ± sd        real     z         p');
  for (const name of STATISTICS) {
    const s = out.stats[name];
    console.log(
      `  ${name.padEnd(14)}  ${String(s.nullMean).padStart(8)} ± ${String(s.nullSd).padEnd(6)}  `
      + `${String(s.real).padStart(6)}   ${String(s.z).padStart(7)}   ${s.p}`,
    );
  }
  const verdict = out.stats.confined.p < BONFERRONI_THRESHOLD ? 'SURVIVES' : 'FAILS';
  console.log(`\n  confined vs threshold ${BONFERRONI_THRESHOLD}: ${verdict}`);
  if (verdict === 'FAILS') {
    console.log('  Per the prereg, confinement is not established. The design fails at F1.');
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    falsifier: 'F1-confinement-configuration-null',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    bonferroniThreshold: BONFERRONI_THRESHOLD,
    statistics: STATISTICS,
    ...out,
    verdict,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`  written → ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/confinement-null.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the falsifier**

```bash
node scripts/quark-confinement-null.mjs
```

Report the printed table verbatim. If `confined` does not clear `p < 0.0125`, **stop and report**: per the prereg the design fails at F1. Do not increase the shuffle count, change the seed, or drop a statistic to rescue it — `feedback-no-posthoc-subgroups` records what happens when subgroups are manufactured after the fact.

- [ ] **Step 6: Complete Falsifier 2's null (deferred from Task 3)**

Task 3 measured real recall but could not compare it to a null, because the shuffler did not exist yet. It does now. Append to `scripts/quark-authored-recovery.mjs`, importing `degreeMatchedShuffle` from `../codex/core/pixelbrain/quark-chamber/configuration-null.js`:

```js
export function runAuthoredRecoveryNull({ blueprints, bridges, shuffles, seed, confinementMin = 2 }) {
  const real = runAuthoredRecovery({ blueprints, bridges, confinementMin });
  const samples = [];
  for (let i = 0; i < shuffles; i += 1) {
    samples.push(runAuthoredRecovery({
      blueprints: degreeMatchedShuffle(blueprints, seed + i), bridges, confinementMin,
    }).recovered);
  }
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const sd = Math.sqrt(samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length);
  const atLeast = samples.filter((value) => value >= real.recovered).length;
  return {
    real,
    nullMean: Number(mean.toFixed(4)),
    nullSd: Number(sd.toFixed(4)),
    z: sd === 0 ? 0 : Number(((real.recovered - mean) / sd).toFixed(4)),
    p: Number(((1 + atLeast) / (1 + samples.length)).toFixed(6)),
  };
}
```

Call it from that script's `main()` with `shuffles: 200, seed: 0x51554152`, print `real / nullMean ± nullSd / z / p`, and add the same fields to its evidence JSON. Then re-run:

```bash
node scripts/quark-authored-recovery.mjs
```

Per the prereg, F2 is established only if real recall exceeds the null at **p < 0.0125**. A real recall above zero that does not beat the null means the slingshot recovers bridges no better than a degree-matched random graph — report that as the refutation it is.

- [ ] **Step 7: Commit**

```bash
git add scripts/quark-confinement-null.mjs \
        scripts/quark-authored-recovery.mjs \
        tests/codex/core/pixelbrain/quark-chamber/confinement-null.test.js \
        docs/superpowers/evidence/2026-08-12-quark-confinement-null.json \
        docs/superpowers/evidence/2026-08-12-quark-authored-recovery.json
git commit -m "test(quark-chamber): falsifier 1 configuration null, and falsifier 2's null

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: Relation algebra and the frozen composition table

Implements deviations **D1** and **D2**. See the Deviations section before starting.

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/relation-algebra.js`
- Test: `tests/codex/core/pixelbrain/quark-chamber/relation-algebra.test.js`

**Interfaces:**
- Consumes: `generateQuarkCandidates` (Task 2).
- Produces:
  - `RELAY_RELATION: 'relays'`
  - `AUTHORED_RELATION_REGISTRY: readonly string[]` — the 16 authored relations plus `satisfies`
  - `DECLARED_COMPOSITIONS: readonly string[]` — the 47 frozen `` `${relA}|${relB}` `` cells
  - `composeRelation(relA: string, relB: string) => 'relays' | null`
  - `censusCompositions(candidates) => {distinct: number, satisfiesSatisfies: number, nonIdentity: string[]}`
  - `permuteDeclaredCompositions(declared, universe, seed) => string[]`

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/relation-algebra.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  RELAY_RELATION,
  AUTHORED_RELATION_REGISTRY,
  DECLARED_COMPOSITIONS,
  composeRelation,
  censusCompositions,
  permuteDeclaredCompositions,
} from '../../../../../codex/core/pixelbrain/quark-chamber/relation-algebra.js';
import { generateQuarkCandidates } from '../../../../../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('relation algebra', () => {
  it('registers 17 relations — 16 authored plus satisfies', () => {
    expect(AUTHORED_RELATION_REGISTRY).toHaveLength(17);
    expect(AUTHORED_RELATION_REGISTRY).toContain('satisfies');
    expect(AUTHORED_RELATION_REGISTRY).not.toContain(RELAY_RELATION);
  });

  it('freezes exactly the 47 measured compositions', () => {
    expect(DECLARED_COMPOSITIONS).toHaveLength(47);
    const nonIdentity = DECLARED_COMPOSITIONS.filter((cell) => !cell.split('|').includes('satisfies'));
    expect(nonIdentity).toHaveLength(15);
  });

  it('emits relays for every declared composition (D2)', () => {
    expect(composeRelation('satisfies', 'satisfies')).toBe(RELAY_RELATION);
    expect(composeRelation('carries', 'surfaces')).toBe(RELAY_RELATION);
    expect(composeRelation('satisfies', 'carries')).toBe(RELAY_RELATION);
  });

  it('absorbs an undeclared composition', () => {
    expect(composeRelation('carries', 'narrows')).toBeNull();   // not among the 47
    expect(composeRelation('gates', 'yields')).toBeNull();
  });

  it('kills relay chains — relays is not in the registry', () => {
    expect(composeRelation(RELAY_RELATION, 'satisfies')).toBeNull();
    expect(composeRelation('satisfies', RELAY_RELATION)).toBeNull();
    expect(composeRelation(RELAY_RELATION, RELAY_RELATION)).toBeNull();
  });

  it('reproduces the measured census', () => {
    const all = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 });
    const census = censusCompositions(all);
    expect(census.distinct).toBe(47);
    expect(census.satisfiesSatisfies).toBe(96);
    expect(census.nonIdentity).toHaveLength(15);
  });

  it('declares its own vacuity on the unmodified full bank (D1)', () => {
    // Every composition occurring here is declared, so the Tier-0 gate absorbs
    // nothing. This is stated openly rather than presented as a passing gate.
    const all = generateQuarkCandidates(FULL_ATOMS, FULL_BRIDGES, { confinementMin: 1 });
    const absorbed = all.filter((c) => c.compositions.every((cell) => {
      const [a, b] = cell.split('|');
      return composeRelation(a, b) === null;
    }));
    expect(absorbed).toHaveLength(0);
  });

  it('permutes declared-ness without changing how many cells are declared', () => {
    const universe = [];
    for (const a of AUTHORED_RELATION_REGISTRY) for (const b of AUTHORED_RELATION_REGISTRY) universe.push(`${a}|${b}`);
    const permuted = permuteDeclaredCompositions(DECLARED_COMPOSITIONS, universe, 7);
    expect(permuted).toHaveLength(DECLARED_COMPOSITIONS.length);
    expect(new Set(permuted).size).toBe(permuted.length);
    expect(permuted.every((cell) => universe.includes(cell))).toBe(true);
    expect(permuted).not.toEqual([...DECLARED_COMPOSITIONS]);
    expect(permuteDeclaredCompositions(DECLARED_COMPOSITIONS, universe, 7)).toEqual(permuted);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/relation-algebra.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/relation-algebra.js`. The 47 cells below were measured on the unmodified full bank on 2026-08-12 and are frozen verbatim:

```js
/**
 * QUARK CHAMBER — the relation algebra (Tier 0, a declared law).
 *
 * D1 — WHY THIS TABLE IS FROZEN, AND WHERE IT IS VACUOUS.
 * The design's "15-cell table" would be derived from a census of the same
 * candidates it gates, which PDR F10 forbids ("no pressure value may be
 * authored by the candidate it ranks"). This table is therefore FROZEN: the 47
 * compositions measured on the unmodified full bank, committed as a constant.
 *
 * On that same unmodified bank it absorbs NOTHING — every composition that
 * occurs is declared, so the gate cannot fail there. That vacuity is declared
 * here rather than hidden, because an always-passing gate presented as a
 * safeguard is this repository's named pathology
 * (`project-checks-that-cannot-fail`). The gate becomes load-bearing under the
 * authored-bridge holdout, the degree-matched null, the permuted-algebra
 * control, and any depth > 1 — all of which evaluate a DIFFERENT graph, to
 * which this table is exogenous.
 *
 * D2 — EVERY DERIVED QUARK CARRIES `relays`.
 * The design introduces `relays` for satisfies-composed-with-satisfies and
 * leaves `satisfies ∘ X` ambiguous. Letting a derived bond inherit an authored
 * relation's LABEL would dress machine output as human judgement, so all
 * derived quarks relay. The composition's information lives in `Π strength`,
 * not in the label. Because `relays` is absent from the authored registry,
 * `relays ∘ anything` is undeclared and long chains die without a special rule.
 */

import { mulberry32 } from '../codebase-nuclei-bank.js';

export const RELAY_RELATION = 'relays';

/** The 16 authored bridge relations, plus the identity `satisfies`. */
export const AUTHORED_RELATION_REGISTRY = Object.freeze([
  'authorizes', 'carries', 'emits', 'excites', 'gates', 'licenses', 'modulates',
  'narrows', 'projects', 'renders', 'requires-human', 'satisfies', 'scores',
  'specializes', 'supports', 'surfaces', 'yields',
]);

/**
 * The 47 compositions measured at depth 1 on the unmodified full bank
 * (56 atoms, 20 authored bridges) on 2026-08-12. Frozen; not regenerated at
 * runtime. Fifteen of these have `satisfies` on neither side.
 */
export const DECLARED_COMPOSITIONS = Object.freeze([
  'authorizes|satisfies',
  'carries|excites',
  'carries|satisfies',
  'carries|surfaces',
  'emits|satisfies',
  'emits|specializes',
  'excites|satisfies',
  'gates|satisfies',
  'licenses|gates',
  'licenses|satisfies',
  'modulates|satisfies',
  'narrows|satisfies',
  'narrows|supports',
  'narrows|surfaces',
  'projects|narrows',
  'projects|renders',
  'projects|satisfies',
  'projects|scores',
  'projects|supports',
  'renders|satisfies',
  'requires-human|satisfies',
  'satisfies|authorizes',
  'satisfies|carries',
  'satisfies|emits',
  'satisfies|excites',
  'satisfies|gates',
  'satisfies|licenses',
  'satisfies|modulates',
  'satisfies|narrows',
  'satisfies|projects',
  'satisfies|renders',
  'satisfies|requires-human',
  'satisfies|satisfies',
  'satisfies|scores',
  'satisfies|supports',
  'satisfies|surfaces',
  'satisfies|yields',
  'scores|satisfies',
  'scores|surfaces',
  'specializes|satisfies',
  'supports|licenses',
  'supports|satisfies',
  'surfaces|satisfies',
  'yields|renders',
  'yields|satisfies',
  'yields|scores',
  'yields|supports',
]);

const DECLARED = new Set(DECLARED_COMPOSITIONS);

/** Tier 0: an undeclared composition yields no quark at all. */
export function composeRelation(relA, relB) {
  return DECLARED.has(`${relA}|${relB}`) ? RELAY_RELATION : null;
}

export function censusCompositions(candidates) {
  const counts = new Map();
  let satisfiesSatisfies = 0;
  for (const candidate of candidates) {
    if (candidate.compositions.includes('satisfies|satisfies')) satisfiesSatisfies += 1;
    for (const cell of candidate.compositions) counts.set(cell, (counts.get(cell) ?? 0) + 1);
  }
  const nonIdentity = [...counts.keys()].filter((cell) => !cell.split('|').includes('satisfies')).sort();
  return { distinct: counts.size, satisfiesSatisfies, nonIdentity };
}

/**
 * Falsifier 4's control: keep the NUMBER of declared cells fixed and move which
 * cells they are. If the chamber behaves the same under this, the algebra
 * carries no information.
 */
export function permuteDeclaredCompositions(declared, universe, seed) {
  if (!Number.isFinite(seed)) throw new TypeError('permuteDeclaredCompositions requires a finite seed');
  if (declared.length > universe.length) throw new RangeError('universe must be at least as large as declared');
  const random = mulberry32(seed);
  const pool = [...universe];
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, declared.length).sort();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/relation-algebra.test.js
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/relation-algebra.js \
        tests/codex/core/pixelbrain/quark-chamber/relation-algebra.test.js
git commit -m "feat(quark-chamber): frozen relation algebra with declared vacuity

The composition table is frozen from the unmodified full bank rather than
regenerated per run, so it is exogenous to the graphs it gates (F10). Its
vacuity on that same bank is asserted by a test rather than left implicit.

All derived quarks carry 'relays'; relays is absent from the registry, so
chains die without a special rule.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Relay strength and the λ bracket sweep

λ is **bracketed by measurement, not chosen**. Upper bound: strictly below the minimum authored bridge strength (0.78), or a machine-derived bond could outrank every human-authored one. Lower bound: a molecule carrying one relay bond must still clear the shuffled-control bar. **If no λ satisfies both, the design fails at this task and stops** (spec §5.2).

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/relay-strength.js`
- Create: `scripts/sweep-relay-lambda.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/relay-strength.test.js`

**Interfaces:**
- Consumes: `generateQuarkCandidates` (Task 2); `composeRelation`, `RELAY_RELATION` (Task 6).
- Produces:
  - `MIN_AUTHORED_STRENGTH: 0.78`, `LAMBDA_SWEEP: readonly number[]`
  - `relayStrength(lambda: number, composedStrengths: number[]) => number` (6dp)
  - `quarkBridgeRules(candidates, lambda, bridgeMap) => {from,to,relation,strength}[]`

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/relay-strength.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  MIN_AUTHORED_STRENGTH,
  LAMBDA_SWEEP,
  relayStrength,
} from '../../../../../codex/core/pixelbrain/quark-chamber/relay-strength.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { bridges: FULL_BRIDGES } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('relay strength', () => {
  it('takes its upper bound from the weakest authored bridge', () => {
    expect(MIN_AUTHORED_STRENGTH).toBe(Math.min(...FULL_BRIDGES.map((b) => b.strength)));
    expect(MIN_AUTHORED_STRENGTH).toBe(0.78);
  });

  it('sweeps only values strictly below the weakest authored bridge', () => {
    expect(LAMBDA_SWEEP.every((lambda) => lambda < MIN_AUTHORED_STRENGTH)).toBe(true);
    expect(LAMBDA_SWEEP.every((lambda) => lambda > 0)).toBe(true);
  });

  it('is the product of lambda and the composed strengths', () => {
    expect(relayStrength(0.5, [1, 1])).toBe(0.5);
    expect(relayStrength(0.5, [0.9, 0.8])).toBe(0.36);
    expect(relayStrength(0.7, [1])).toBe(0.7);
  });

  it('can never reach the weakest authored bridge', () => {
    for (const lambda of LAMBDA_SWEEP) {
      expect(relayStrength(lambda, [1, 1])).toBeLessThan(MIN_AUTHORED_STRENGTH);
    }
  });

  it('rejects a lambda at or above the authored floor', () => {
    expect(() => relayStrength(0.78, [1])).toThrow(/authored/i);
    expect(() => relayStrength(0.95, [1])).toThrow(/authored/i);
  });

  it('rejects non-finite input rather than coercing it', () => {
    expect(() => relayStrength(Number.NaN, [1])).toThrow(/finite/i);
    expect(() => relayStrength(0.5, [Number.POSITIVE_INFINITY])).toThrow(/finite/i);
    expect(() => relayStrength(0.5, [])).toThrow(/at least one/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/relay-strength.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/relay-strength.js`:

```js
/**
 * QUARK CHAMBER — relay strength.
 *
 * STRAIN IS NOT A NEW CURRENCY. It is decay of `strength`, which already flows
 * into molecule energy through the existing `0.40 · linkStrength` term. A
 * relayed bond scores lower than a direct bond BECAUSE IT IS PHYSICALLY WEAKER,
 * not because a penalty was added to the score. This preserves the discipline
 * established when osmosis was removed from finalScore on 2026-08-12: no new
 * scoring term, and the units stay honest
 * (`project-semantic-calculus-adjudicates-scores`).
 *
 *   strength(quark) = lambda · Π strength(composed edges),   lambda < 0.78
 *
 * The upper bound is the weakest authored bridge in the full bank. A derived
 * bond that could outrank every human-authored one would invert the machine's
 * whole relationship to human judgement.
 */

export const MIN_AUTHORED_STRENGTH = 0.78;

/** Bracket swept by scripts/sweep-relay-lambda.mjs. Upper end stays strictly below the floor. */
export const LAMBDA_SWEEP = Object.freeze([0.30, 0.35, 0.40, 0.45, 0.50, 0.55, 0.60, 0.65, 0.70, 0.75]);

const round6 = (value) => Math.round(value * 1e6) / 1e6;

export function relayStrength(lambda, composedStrengths) {
  if (!Number.isFinite(lambda)) throw new TypeError('relayStrength requires a finite lambda');
  if (lambda <= 0) throw new RangeError('lambda must be greater than 0');
  if (lambda >= MIN_AUTHORED_STRENGTH) {
    throw new RangeError(
      `lambda must be strictly below the weakest authored bridge strength `
      + `(${MIN_AUTHORED_STRENGTH}); received ${lambda}. A derived bond may never `
      + 'outrank a human-authored one.',
    );
  }
  if (!Array.isArray(composedStrengths) || composedStrengths.length === 0) {
    throw new RangeError('relayStrength requires at least one composed strength');
  }
  let product = 1;
  for (const strength of composedStrengths) {
    if (!Number.isFinite(strength)) throw new TypeError('composed strengths must all be finite');
    if (strength < 0 || strength > 1) throw new RangeError('composed strengths must lie in 0..1');
    product *= strength;
  }
  return round6(lambda * product);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/relay-strength.test.js
```

Expected: PASS.

- [ ] **Step 5: Write the sweep script**

Create `scripts/sweep-relay-lambda.mjs`. It runs the cyclotron once per λ and selects the largest λ meeting both constraints.

```js
#!/usr/bin/env node

/**
 * Derive lambda by sweeping its measured bracket.
 *
 *   UPPER: lambda < 0.78, the weakest authored bridge strength (enforced by
 *          relayStrength itself).
 *   LOWER: a molecule carrying at least one relay bond must still clear the
 *          shuffled-control bar, re-measured on the full bank in this run.
 *
 * Selection: the LARGEST lambda that (a) puts relay-bearing molecules above the
 * control bar and (b) does not displace direct-bond molecules at the top of the
 * shortlist. "Does not displace" is fixed in advance as: the top-ranked
 * molecule's checksum is unchanged from the lambda-free baseline, and at least
 * half of the baseline's top 8 survive in the treatment's top 8.
 *
 * If no lambda satisfies both, THE DESIGN FAILS AT THIS TASK AND STOPS. Do not
 * widen the bracket, and do not relax the displacement rule to find a winner.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { composeRelation, RELAY_RELATION } from '../codex/core/pixelbrain/quark-chamber/relation-algebra.js';
import { relayStrength, LAMBDA_SWEEP, MIN_AUTHORED_STRENGTH } from '../codex/core/pixelbrain/quark-chamber/relay-strength.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank, FULL_BANK_CONCENTRATION_LIMIT } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-lambda-sweep.json';
const TRIALS = 20_000;
const SEED = 0x51554152;

/** Build the derived bridge rules for a given lambda. Undeclared compositions are absorbed. */
export function quarkBridgeRules(candidates, lambda, bridgeMap) {
  const rules = [];
  for (const candidate of candidates) {
    for (const cell of candidate.compositions) {
      const [relA, relB] = cell.split('|');
      if (composeRelation(relA, relB) === null) continue;
      // Composed edge strengths: a `satisfies` leg is 1; a bridged leg carries the
      // weakest authored strength, which is the conservative choice — it can only
      // make the derived bond weaker, never stronger than the evidence supports.
      const composed = [relA === 'satisfies' ? 1 : MIN_AUTHORED_STRENGTH, relB === 'satisfies' ? 1 : MIN_AUTHORED_STRENGTH];
      rules.push({
        from: candidate.from,
        to: candidate.to,
        relation: RELAY_RELATION,
        strength: relayStrength(lambda, composed),
      });
      break; // one rule per candidate; the strongest declared composition wins
    }
  }
  return rules;
}

function runArm(blueprints, bridges) {
  return runSemanticValenceCyclotron({
    atoms: blueprints,
    bridgeRules: bridges,
    trialCount: TRIALS,
    seed: SEED,
    osmosisConcentrationLimit: FULL_BANK_CONCENTRATION_LIMIT,
  });
}

function main() {
  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const bridgeMap = new Map(bridges.map((rule) => [`${rule.from}|${rule.to}`, rule]));
  const candidates = generateQuarkCandidates(blueprints, bridges, {});

  const baseline = runArm(blueprints, bridges);
  // The report's shortlist field is `candidates`, each row carrying `.molecule`,
  // `.finalScore` and `.verdict`, already sorted verdict-then-score.
  const baselineTop = baseline.candidates.slice(0, 8).map((row) => row.molecule.checksum);
  console.log(`baseline: control bar ${baseline.control.bar}, candidates ${baseline.candidates.length}`);

  const rows = [];
  for (const lambda of LAMBDA_SWEEP) {
    const derived = quarkBridgeRules(candidates, lambda, bridgeMap);
    const treatment = runArm(blueprints, [...bridges, ...derived]);
    const relayBearing = treatment.candidates.filter(
      (row) => row.molecule.bonds.some((bond) => bond.relation === RELAY_RELATION),
    );
    const treatmentTop = treatment.candidates.slice(0, 8).map((row) => row.molecule.checksum);
    const survivors = baselineTop.filter((checksum) => treatmentTop.includes(checksum)).length;
    const clearsBar = relayBearing.length > 0;
    const noDisplacement = treatmentTop[0] === baselineTop[0] && survivors >= Math.ceil(baselineTop.length / 2);
    rows.push({
      lambda,
      derivedRules: derived.length,
      relayBearingShortlisted: relayBearing.length,
      controlBar: treatment.control.bar,
      top8Survivors: survivors,
      clearsBar,
      noDisplacement,
      admissible: clearsBar && noDisplacement,
    });
    console.log(
      `  lambda ${lambda.toFixed(2)}  rules ${String(derived.length).padStart(3)}  `
      + `relay-bearing ${String(relayBearing.length).padStart(3)}  top8 survivors ${survivors}/8  `
      + `${clearsBar && noDisplacement ? 'ADMISSIBLE' : 'rejected'}`,
    );
  }

  const admissible = rows.filter((row) => row.admissible);
  const selected = admissible.length ? Math.max(...admissible.map((row) => row.lambda)) : null;

  if (selected === null) {
    console.log('\nNO ADMISSIBLE LAMBDA. Per the design, section 5.2, the design fails at this');
    console.log('task and stops. Do not widen the bracket to manufacture a winner.');
  } else {
    console.log(`\nselected lambda = ${selected}`);
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    trials: TRIALS,
    seed: SEED,
    baselineControlBar: baseline.control.bar,
    sweep: rows,
    selectedLambda: selected,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`written → ${OUTPUT_PATH}`);
  if (selected === null) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 6: Run the sweep**

```bash
node scripts/sweep-relay-lambda.mjs
```

Report the printed table. If no λ is admissible, **stop and report** — the design fails here by its own terms. Record the selected λ; Tasks 9 and 11 consume it.

- [ ] **Step 7: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/relay-strength.js \
        scripts/sweep-relay-lambda.mjs \
        tests/codex/core/pixelbrain/quark-chamber/relay-strength.test.js \
        docs/superpowers/evidence/2026-08-12-quark-lambda-sweep.json
git commit -m "feat(quark-chamber): relay strength and the lambda bracket sweep

Strain is decay of strength, not a new scoring term. Lambda is bracketed by the
weakest authored bridge above and the shuffled-control bar below, and the sweep
aborts rather than widening the bracket when nothing is admissible.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: Layer 2 — semantic calculus adjudication

Each candidate becomes a `Modulator` over `permission.ts:ModulatableState`. Tier 0 is an **absorbing zero** modelled on `isZero` — the candidate leaves the set, it is not ranked last (PDR F2).

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/adjudicate.js`
- Test: `tests/codex/core/pixelbrain/quark-chamber/adjudicate.test.js`

**Interfaces:**
- Consumes: `composeRelation` (Task 6); `applyModulation`, `isZero` from `codex/core/semantic-calculus/permission.ts`; `conceptPMI` from `grounding-index.js`; `semanticTopographicSimilarity` from `codex/core/semantic/semantotopography.js`.
- Produces:
  - `QUARK_PRESSURE_SOURCES: readonly {id, tier, producerModule}[]`
  - `PROPOSER_MODULE: 'codex/core/pixelbrain/quark-chamber/slingshot.js'`
  - `compositionModulator() => Modulator`, `contradictionModulator(index) => Modulator`, `affinityModulator() => Modulator`
  - `adjudicateQuark(candidate, {index}) => {admitted: boolean, affinity: number, blockedBy: string | null, state: object}`

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/adjudicate.test.js`:

```js
import { describe, it, expect } from 'vitest';
import {
  QUARK_PRESSURE_SOURCES,
  PROPOSER_MODULE,
  adjudicateQuark,
} from '../../../../../codex/core/pixelbrain/quark-chamber/adjudicate.js';

const CANDIDATE = (from, to, compositions) => ({
  from, to, witnesses: ['way-1', 'way-2'], compositions,
});

describe('layer 2 adjudication', () => {
  describe('F10 — no self-scored pressure', () => {
    it('names an external producer for every source', () => {
      expect(QUARK_PRESSURE_SOURCES.length).toBeGreaterThan(0);
      for (const source of QUARK_PRESSURE_SOURCES) {
        expect(source.producerModule).toBeTruthy();
        expect(source.producerModule).not.toBe(PROPOSER_MODULE);
      }
    });

    it('assigns every source a tier', () => {
      for (const source of QUARK_PRESSURE_SOURCES) {
        expect([0, 1, 2, 3]).toContain(source.tier);
      }
    });
  });

  describe('tier 0 is absorbing, not merely low-ranked (F2)', () => {
    it('removes a candidate whose composition is undeclared', () => {
      const result = adjudicateQuark(CANDIDATE('p-a', 'p-w', ['carries|narrows']), {});
      expect(result.admitted).toBe(false);
      expect(result.blockedBy).toBe('composition');
    });

    it('admits a candidate whose composition is declared', () => {
      const result = adjudicateQuark(CANDIDATE('p-a', 'p-w', ['satisfies|satisfies']), {});
      expect(result.admitted).toBe(true);
      expect(result.blockedBy).toBeNull();
    });

    it('removes a candidate whose ports the corpus says repel', () => {
      const repelling = {
        _groundingFns: {},
        conceptPMI: () => ({ signal: 'REPULSION', meanPMI: -2, pairs: 10, coverage: 0.9 }),
      };
      const result = adjudicateQuark(
        CANDIDATE('p-a', 'p-w', ['satisfies|satisfies']),
        { index: repelling, pmi: () => ({ signal: 'REPULSION' }) },
      );
      expect(result.admitted).toBe(false);
      expect(result.blockedBy).toBe('contradiction');
    });
  });

  describe('tier 2 ranks but never gates', () => {
    it('admits a low-affinity candidate and reports the affinity', () => {
      const result = adjudicateQuark(CANDIDATE('p-a', 'p-w', ['satisfies|satisfies']), {});
      expect(result.admitted).toBe(true);
      expect(result.affinity).toBeGreaterThanOrEqual(0);
      expect(result.affinity).toBeLessThanOrEqual(1);
    });

    it('never widens permission — the chamber holds no lawGrant', () => {
      // applyModulation throws SEMANTIC_CALCULUS_PERMISSION_WIDENED on unreasoned
      // widening; adjudication must complete without one.
      expect(() => adjudicateQuark(CANDIDATE('p-a', 'p-w', ['satisfies|satisfies']), {})).not.toThrow();
    });
  });

  it('is deterministic', () => {
    const candidate = CANDIDATE('p-a', 'p-w', ['satisfies|satisfies']);
    expect(adjudicateQuark(candidate, {})).toEqual(adjudicateQuark(candidate, {}));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/adjudicate.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/adjudicate.js`:

```js
/**
 * QUARK CHAMBER — Layer 2: semantic calculus adjudication.
 *
 * Each candidate is a Modulator over permission.ts:ModulatableState. Tier 0 is
 * an ABSORBING ZERO modelled on `isZero`: the candidate leaves the set, it is
 * not ranked last (PDR F2). Tier 2 ranks only and must never gate.
 *
 * `affinity` is a WEAK PRIOR and is documented as one. Authored bridge rules sit
 * at background cosine percentiles 36.8 … 99.0 — mean 0.71 against a null of
 * 0.50, z ~ 2.10, p ~ 0.018 at n = 8. There is NO UPPER CUTOFF: the
 * highest-cosine authored pair is `ranked-frontier -> candidate-frontier` at
 * 0.728, and it is correct precisely because those ports are near-synonyms.
 * Cosine is a floor with no ceiling and must never gate.
 */

import { applyModulation } from '../../semantic-calculus/permission.ts';
import { conceptPMI } from '../grounding-index.js';
import { semanticTopographicSimilarity } from '../../semantic/semantotopography.js';
import { composeRelation } from './relation-algebra.js';

export const PROPOSER_MODULE = 'codex/core/pixelbrain/quark-chamber/slingshot.js';

/** F10: every source resolves from an artifact with an independent producer. */
export const QUARK_PRESSURE_SOURCES = Object.freeze([
  Object.freeze({
    id: 'composition',
    tier: 0,
    producerModule: 'codex/core/pixelbrain/quark-chamber/relation-algebra.js',
  }),
  Object.freeze({
    id: 'contradiction',
    tier: 0,
    producerModule: 'codex/core/pixelbrain/grounding-index.js',
  }),
  Object.freeze({
    id: 'affinity',
    tier: 2,
    producerModule: 'codex/core/semantic/semantotopography.js',
  }),
]);

const portText = (port) => String(port).replace(/[-_]/g, ' ');

export function compositionModulator() {
  return {
    id: 'composition',
    apply: (state) => {
      const declared = state.candidate.compositions.some((cell) => {
        const [relA, relB] = cell.split('|');
        return composeRelation(relA, relB) !== null;
      });
      if (declared) return state;
      return { ...state, law: { decision: 'block' }, blockedBy: 'composition' };
    },
  };
}

export function contradictionModulator(index, pmiFn) {
  return {
    id: 'contradiction',
    apply: (state) => {
      if (!index) return state; // no corpus loaded → no signal, and absence is not repulsion
      const measure = pmiFn ?? ((a, b) => conceptPMI(index, a, b));
      const pmi = measure(portText(state.candidate.from), portText(state.candidate.to));
      if (pmi?.signal !== 'REPULSION') return state;
      return { ...state, law: { decision: 'block' }, blockedBy: 'contradiction' };
    },
  };
}

export function affinityModulator() {
  return {
    id: 'affinity',
    apply: (state) => {
      const cosine = semanticTopographicSimilarity(
        portText(state.candidate.from),
        portText(state.candidate.to),
      );
      const affinity = Math.max(0, Math.min(1, Number.isFinite(cosine) ? cosine : 0));
      // Permission-DECREASING: score starts at 1 and may only fall.
      return { ...state, score: Math.min(state.score, affinity), affinity };
    },
  };
}

export function adjudicateQuark(candidate, { index = null, pmi = null } = {}) {
  const initial = {
    kind: 'Hypothesis', // a candidate quark is a guess; it never rises above one
    scope: [candidate.from, candidate.to],
    score: 1,
    law: { decision: 'allow' },
    candidate,
    affinity: 0,
    blockedBy: null,
  };

  // No lawGrant anywhere: the chamber cannot widen its own permission (F2a).
  const { state } = applyModulation(initial, [
    compositionModulator(),
    contradictionModulator(index, pmi),
    affinityModulator(),
  ]);

  return {
    admitted: state.law?.decision !== 'block',
    affinity: state.affinity ?? 0,
    blockedBy: state.blockedBy ?? null,
    state,
  };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/adjudicate.test.js
```

Expected: PASS. Vitest transforms TypeScript, so the `.ts` import resolves here. It will **not** resolve under plain `node` — see the global constraint; Task 9's CLI runs under `tsx` for exactly this reason. Do not convert `permission.ts` to JavaScript.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/adjudicate.js \
        tests/codex/core/pixelbrain/quark-chamber/adjudicate.test.js
git commit -m "feat(quark-chamber): layer 2 semantic calculus adjudication

Three pressure sources, each naming a producer module distinct from the
proposer (F10). Tier 0 absorbs via permission.ts isZero rather than ranking
last (F2). Affinity is a floor with no ceiling and never gates.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 9: Layer 3 — grant proposal and the F8a outcome ledger

A surviving quark widens the licensed graph, so under **F2a** it *is* a permission grant. The chamber emits a proposal; a human commits it. **The chamber is structurally incapable of opening its own gate**, and this task proves it with a test rather than asserting it in a comment.

**Files:**
- Create: `codex/core/pixelbrain/quark-chamber/grant.js`
- Create: `scripts/quark-chamber.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/grant.test.js`

**Interfaces:**
- Consumes: `adjudicateQuark` (Task 8); `relayStrength` (Task 7); `applyModulation` and `SEMANTIC_CALCULUS_ERRORS` from the semantic calculus.
- Produces:
  - `GRANT_OUTCOMES: readonly ['succeeded','regressed','needed_rework','grant_was_wrong']`
  - `quarkId(candidate) => string`
  - `proposeQuarkGrant(candidate, {lambda, composedStrengths, affinity}) => {quarkId, bridgeRule, record, outcome: null}`
  - `appendLedgerRow(path, row) => void`, `readLedger(path) => row[]`, `pendingGrants(rows) => row[]`, `resolveGrant(rows, quarkId, outcome) => row`

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/grant.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  GRANT_OUTCOMES,
  quarkId,
  proposeQuarkGrant,
  appendLedgerRow,
  readLedger,
  pendingGrants,
  resolveGrant,
} from '../../../../../codex/core/pixelbrain/quark-chamber/grant.js';
import { applyModulation } from '../../../../../codex/core/semantic-calculus/permission.ts';

const CANDIDATE = {
  from: 'p-a', to: 'p-w', witnesses: ['way-1', 'way-2'], compositions: ['satisfies|satisfies'],
};

describe('layer 3 grant proposal', () => {
  it('proposes a bridge rule at the relayed strength, unresolved', () => {
    const proposal = proposeQuarkGrant(CANDIDATE, { lambda: 0.5, composedStrengths: [1, 1], affinity: 0.6 });
    expect(proposal.bridgeRule).toEqual({ from: 'p-a', to: 'p-w', relation: 'relays', strength: 0.5 });
    expect(proposal.outcome).toBeNull();
    expect(proposal.quarkId).toBe(quarkId(CANDIDATE));
  });

  it('carries a PermissionGrantRecord naming a human committer', () => {
    const proposal = proposeQuarkGrant(CANDIDATE, { lambda: 0.5, composedStrengths: [1, 1], affinity: 0.6 });
    expect(proposal.record.modulatorId).toContain('quark');
    expect(proposal.record.reason).toBeTruthy();
    expect(proposal.record.lawGrant).toMatch(/human/i);
  });

  describe('F8a — the outcome predicate', () => {
    it('offers grant_was_wrong as a resolvable outcome', () => {
      expect(GRANT_OUTCOMES).toContain('grant_was_wrong');
      expect(GRANT_OUTCOMES).toHaveLength(4);
    });

    it('treats an unresolved row as pending and a resolved one as not', () => {
      const rows = [
        { quarkId: 'q1', outcome: null },
        { quarkId: 'q2', outcome: null },
        { quarkId: 'q2', outcome: 'grant_was_wrong' },
      ];
      expect(pendingGrants(rows).map((row) => row.quarkId)).toEqual(['q1']);
    });

    it('appends a resolution row and never mutates the original', () => {
      const dir = mkdtempSync(join(tmpdir(), 'quark-ledger-'));
      const path = join(dir, 'ledger.jsonl');
      try {
        const proposal = proposeQuarkGrant(CANDIDATE, { lambda: 0.5, composedStrengths: [1, 1], affinity: 0.6 });
        appendLedgerRow(path, proposal);
        appendLedgerRow(path, resolveGrant(readLedger(path), proposal.quarkId, 'grant_was_wrong'));

        const rows = readLedger(path);
        expect(rows).toHaveLength(2);
        expect(rows[0].outcome).toBeNull();          // original untouched
        expect(rows[1].outcome).toBe('grant_was_wrong');
        expect(rows[1].quarkId).toBe(proposal.quarkId);
        expect(pendingGrants(rows)).toHaveLength(0);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('refuses an outcome outside the declared set', () => {
      expect(() => resolveGrant([{ quarkId: 'q1', outcome: null }], 'q1', 'looks_fine')).toThrow(/outcome/i);
    });
  });

  describe('the chamber cannot open its own gate (F2a)', () => {
    it('throws SEMANTIC_CALCULUS_PERMISSION_WIDENED when a modulator widens without a grant', () => {
      const widening = { id: 'rogue-quark', apply: (state) => ({ ...state, kind: 'Do' }) };
      expect(() => applyModulation(
        { kind: 'Hypothesis', scope: ['p-a'], score: 0.5, law: { decision: 'allow' } },
        [widening],
      )).toThrow(/PERMISSION_WIDENED|widen/i);
    });
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/grant.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `codex/core/pixelbrain/quark-chamber/grant.js`:

```js
/**
 * QUARK CHAMBER — Layer 3: grant proposal.
 *
 * A surviving quark widens the licensed graph, so under PDR F2a it IS a
 * permission grant. The chamber emits a PROPOSAL; a human commits it into
 * BRIDGE_RULES. This is the same shape as F9 calibration: the machine
 * proposes, a human commits. The chamber is structurally incapable of opening
 * its own gate, because it never passes a `lawGrant` to `applyModulation`.
 *
 * F8a — THE PREDICATE. Every committed quark must be markable
 * `grant_was_wrong`. A quark nobody can mark wrong is decorative prose
 * (`project-checks-that-cannot-fail`). Resolution APPENDS a new row and never
 * mutates the original, per the denial ledger's append-only discipline.
 */

import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { RELAY_RELATION } from './relation-algebra.js';
import { relayStrength } from './relay-strength.js';
import { sha256Hex } from '../../immunity/cleri-probe/canonical-report.js';

export const GRANT_OUTCOMES = Object.freeze([
  'succeeded', 'regressed', 'needed_rework', 'grant_was_wrong',
]);

export function quarkId(candidate) {
  return `quark-${sha256Hex({ from: candidate.from, to: candidate.to }).slice(0, 16)}`;
}

export function proposeQuarkGrant(candidate, { lambda, composedStrengths, affinity }) {
  const strength = relayStrength(lambda, composedStrengths);
  const id = quarkId(candidate);
  return {
    contract: 'PB-QUARK-CHAMBER-v1',
    quarkId: id,
    bridgeRule: { from: candidate.from, to: candidate.to, relation: RELAY_RELATION, strength },
    witnesses: candidate.witnesses,
    compositions: candidate.compositions,
    affinity,
    record: {
      modulatorId: `quark-chamber:${id}`,
      lawGrant: 'PENDING_HUMAN_COMMIT',
      reason:
        `${candidate.witnesses.length} independent waypoints license ${candidate.from} -> `
        + `${candidate.to}; relayed at lambda ${lambda}. Proposed, not granted.`,
      from: { kind: 1, scope: 2, confidence: 1 },
      to: { kind: 1, scope: 2, confidence: affinity },
    },
    outcome: null,
  };
}

export function appendLedgerRow(path, row) {
  appendFileSync(path, `${JSON.stringify(row)}\n`);
}

export function readLedger(path) {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line));
}

/** A quark is pending until some LATER row resolves it. */
export function pendingGrants(rows) {
  const resolved = new Set(rows.filter((row) => row.outcome !== null).map((row) => row.quarkId));
  return rows.filter((row) => row.outcome === null && !resolved.has(row.quarkId));
}

export function resolveGrant(rows, id, outcome) {
  if (!GRANT_OUTCOMES.includes(outcome)) {
    throw new RangeError(`outcome must be one of ${GRANT_OUTCOMES.join(', ')}; received ${outcome}`);
  }
  const proposal = rows.find((row) => row.quarkId === id && row.outcome === null);
  if (!proposal) throw new RangeError(`no pending grant with id ${id}`);
  return {
    contract: 'PB-QUARK-CHAMBER-v1',
    quarkId: id,
    outcome,
    resolvedAt: new Date().toISOString(),
  };
}
```

- [ ] **Step 4: Write the CLI**

Create `scripts/quark-chamber.mjs`:

```js
#!/usr/bin/env node

/**
 * Quark Chamber CLI. The machine proposes; a human commits.
 *
 * RUN WITH `tsx`, NOT `node`. This script reaches permission.ts through
 * adjudicate.js, and Node v20 cannot load a .ts file
 * (ERR_UNKNOWN_FILE_EXTENSION). Vitest is unaffected.
 *
 *   npx tsx scripts/quark-chamber.mjs --propose --lambda=0.5
 *   npx tsx scripts/quark-chamber.mjs --pending
 *   npx tsx scripts/quark-chamber.mjs --resolve=<quark-id> --outcome=grant_was_wrong
 *
 * --propose NEVER edits BRIDGE_RULES. It writes proposals to the ledger; a
 * human copies the accepted bridgeRule into codebase-nuclei-bank.js by hand.
 */

import { pathToFileURL } from 'node:url';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { adjudicateQuark } from '../codex/core/pixelbrain/quark-chamber/adjudicate.js';
import {
  GRANT_OUTCOMES, proposeQuarkGrant, appendLedgerRow, readLedger, pendingGrants, resolveGrant,
} from '../codex/core/pixelbrain/quark-chamber/grant.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { loadEncyclopediaIndex, prepareForSynthesize } from '../codex/core/pixelbrain/grounding-index.js';

const LEDGER_PATH = 'docs/superpowers/evidence/QUARK-GRANT-LEDGER.jsonl';

const flag = (name) => {
  const raw = process.argv.slice(2).find((arg) => arg.startsWith(`--${name}=`));
  return raw ? raw.slice(name.length + 3) : null;
};
const has = (name) => process.argv.slice(2).includes(`--${name}`);

function main() {
  if (has('pending')) {
    const rows = pendingGrants(readLedger(LEDGER_PATH));
    if (rows.length === 0) console.log('No pending grants.');
    for (const row of rows) {
      console.log(`${row.quarkId}  ${row.bridgeRule.from} -> ${row.bridgeRule.to}  `
        + `strength ${row.bridgeRule.strength}  witnesses ${row.witnesses.join(', ')}`);
    }
    return;
  }

  const resolveId = flag('resolve');
  if (resolveId) {
    const outcome = flag('outcome');
    if (!GRANT_OUTCOMES.includes(outcome)) {
      throw new RangeError(`--outcome must be one of ${GRANT_OUTCOMES.join(', ')}`);
    }
    appendLedgerRow(LEDGER_PATH, resolveGrant(readLedger(LEDGER_PATH), resolveId, outcome));
    console.log(`resolved ${resolveId} → ${outcome}`);
    return;
  }

  if (!has('propose')) {
    console.log('usage: --propose --lambda=<n> | --pending | --resolve=<id> --outcome=<verdict>');
    return;
  }

  const lambda = Number(flag('lambda'));
  if (!Number.isFinite(lambda)) throw new TypeError('--lambda=<n> is required and must be finite');

  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const index = prepareForSynthesize(loadEncyclopediaIndex());
  const candidates = generateQuarkCandidates(blueprints, bridges, {});

  let proposed = 0;
  for (const candidate of candidates) {
    const verdict = adjudicateQuark(candidate, { index });
    if (!verdict.admitted) {
      console.log(`  absorbed  ${candidate.from} -> ${candidate.to}  (${verdict.blockedBy})`);
      continue;
    }
    const composed = candidate.compositions[0].split('|').map((rel) => (rel === 'satisfies' ? 1 : 0.78));
    const proposal = proposeQuarkGrant(candidate, {
      lambda, composedStrengths: composed, affinity: verdict.affinity,
    });
    appendLedgerRow(LEDGER_PATH, proposal);
    proposed += 1;
    console.log(`  PROPOSED  ${proposal.quarkId}  ${candidate.from} -> ${candidate.to}  `
      + `strength ${proposal.bridgeRule.strength}`);
  }

  console.log(`\n${proposed} proposal(s) written to ${LEDGER_PATH}.`);
  console.log('No bridge rule has been committed. A human must copy accepted rules into');
  console.log('codex/core/pixelbrain/codebase-nuclei-bank.js by hand.');
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/grant.test.js
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add codex/core/pixelbrain/quark-chamber/grant.js \
        scripts/quark-chamber.mjs \
        tests/codex/core/pixelbrain/quark-chamber/grant.test.js
git commit -m "feat(quark-chamber): layer 3 grant proposal and F8a outcome ledger

The chamber proposes; a human commits. Every grant is markable grant_was_wrong,
and resolution appends rather than mutating. A rogue widening modulator is
tested to throw SEMANTIC_CALCULUS_PERMISSION_WIDENED.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 10: Permuted-relation-algebra control (Falsifier 4)

Novelty is `1 − max similarity to constituent atoms`, so admitting *any* bond between semantically distant ports raises it **by construction**. The only honest control holds the quark count and λ fixed and permutes the algebra.

**Files:**
- Create: `scripts/quark-permuted-algebra.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/permuted-algebra.test.js`

**Interfaces:**
- Consumes: `permuteDeclaredCompositions`, `AUTHORED_RELATION_REGISTRY`, `DECLARED_COMPOSITIONS`, `RELAY_RELATION` (Task 6); `relayStrength`, `MIN_AUTHORED_STRENGTH` (Task 7). It builds its rules with a local `rulesFor` rather than importing Task 7's `quarkBridgeRules`, because it must swap the declared set per permutation.
- Produces: `ksStatistic(a: number[], b: number[]) => {d: number, p: number}`, `runPermutedAlgebra({blueprints, bridges, lambda, permutations, seed}) => {real, permuted, ks, verdict}`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/permuted-algebra.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { ksStatistic } from '../../../../../scripts/quark-permuted-algebra.mjs';

describe('KS statistic', () => {
  it('is zero for identical samples', () => {
    const sample = [0.1, 0.2, 0.3, 0.4, 0.5];
    expect(ksStatistic(sample, sample).d).toBe(0);
  });

  it('is one for completely separated samples', () => {
    expect(ksStatistic([0, 0.1, 0.2], [0.8, 0.9, 1]).d).toBe(1);
  });

  it('rises as the samples separate', () => {
    const near = ksStatistic([0.1, 0.2, 0.3], [0.15, 0.25, 0.35]).d;
    const far = ksStatistic([0.1, 0.2, 0.3], [0.7, 0.8, 0.9]).d;
    expect(far).toBeGreaterThan(near);
  });

  it('returns a p-value in the unit interval', () => {
    const { p } = ksStatistic([0.1, 0.2, 0.3, 0.4], [0.5, 0.6, 0.7, 0.8]);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it('rejects empty samples rather than coercing them', () => {
    expect(() => ksStatistic([], [0.1])).toThrow(/empty/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/permuted-algebra.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `scripts/quark-permuted-algebra.mjs`:

```js
#!/usr/bin/env node

/**
 * FALSIFIER 4 — is the algebra doing any work, or is it a noise injector?
 *
 * Novelty is `1 - max similarity to constituent atoms`, so admitting ANY bond
 * between distant ports raises it by construction. A rise in novelty therefore
 * proves nothing on its own. The control holds the number of admitted quarks
 * and lambda FIXED and permutes which composition cells are declared.
 *
 * If real and permuted algebras produce the same novelty and verdict
 * distributions, the algebra carries no information and the chamber is a noise
 * injector. Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import {
  AUTHORED_RELATION_REGISTRY, DECLARED_COMPOSITIONS, permuteDeclaredCompositions, RELAY_RELATION,
} from '../codex/core/pixelbrain/quark-chamber/relation-algebra.js';
import { relayStrength } from '../codex/core/pixelbrain/quark-chamber/relay-strength.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank, FULL_BANK_CONCENTRATION_LIMIT } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-permuted-algebra.json';
const BONFERRONI_THRESHOLD = 0.0125;
const TRIALS = 20_000;

export function ksStatistic(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length === 0 || b.length === 0) {
    throw new RangeError('ksStatistic requires two non-empty samples');
  }
  const left = [...a].sort((x, y) => x - y);
  const right = [...b].sort((x, y) => x - y);
  const all = [...new Set([...left, ...right])].sort((x, y) => x - y);
  const cdf = (sorted, value) => sorted.filter((entry) => entry <= value).length / sorted.length;
  let d = 0;
  for (const value of all) d = Math.max(d, Math.abs(cdf(left, value) - cdf(right, value)));

  // Asymptotic two-sample Kolmogorov-Smirnov p-value.
  const n = (left.length * right.length) / (left.length + right.length);
  const lambda = (Math.sqrt(n) + 0.12 + 0.11 / Math.sqrt(n)) * d;
  let p = 0;
  for (let j = 1; j <= 100; j += 1) p += ((-1) ** (j - 1)) * Math.exp(-2 * j * j * lambda * lambda);
  return { d: Number(d.toFixed(6)), p: Math.max(0, Math.min(1, Number((2 * p).toFixed(6)))) };
}

function rulesFor(candidates, declaredSet, lambda) {
  const rules = [];
  for (const candidate of candidates) {
    const cell = candidate.compositions.find((entry) => declaredSet.has(entry));
    if (!cell) continue;
    const composed = cell.split('|').map((rel) => (rel === 'satisfies' ? 1 : 0.78));
    rules.push({
      from: candidate.from, to: candidate.to, relation: RELAY_RELATION,
      strength: relayStrength(lambda, composed),
    });
  }
  return rules;
}

/** The report's shortlist field is `candidates`; each row carries `.molecule`. */
function noveltiesOf(report) {
  return report.candidates.map((row) => row.molecule.novelty);
}

export function runPermutedAlgebra({ blueprints, bridges, lambda, permutations, seed }) {
  const candidates = generateQuarkCandidates(blueprints, bridges, {});
  const universe = [];
  for (const a of AUTHORED_RELATION_REGISTRY) for (const b of AUTHORED_RELATION_REGISTRY) universe.push(`${a}|${b}`);

  const run = (rules) => runSemanticValenceCyclotron({
    atoms: blueprints,
    bridgeRules: [...bridges, ...rules],
    trialCount: TRIALS,
    seed,
    osmosisConcentrationLimit: FULL_BANK_CONCENTRATION_LIMIT,
  });

  const realRules = rulesFor(candidates, new Set(DECLARED_COMPOSITIONS), lambda);
  const realReport = run(realRules);
  const realNovelty = noveltiesOf(realReport);

  const permutedSamples = [];
  for (let i = 0; i < permutations; i += 1) {
    const declared = new Set(permuteDeclaredCompositions(DECLARED_COMPOSITIONS, universe, seed + i));
    const rules = rulesFor(candidates, declared, lambda);
    permutedSamples.push({ rules: rules.length, novelty: noveltiesOf(run(rules)) });
  }

  const pooled = permutedSamples.flatMap((sample) => sample.novelty);
  const ks = ksStatistic(realNovelty, pooled);
  return {
    real: { rules: realRules.length, shortlist: realNovelty.length },
    permuted: { runs: permutations, pooledShortlist: pooled.length },
    ks,
    verdict: ks.p < BONFERRONI_THRESHOLD ? 'ALGEBRA_CARRIES_INFORMATION' : 'INDISTINGUISHABLE_FROM_NOISE',
  };
}

function main() {
  const lambda = Number(process.argv.slice(2).find((a) => a.startsWith('--lambda='))?.slice(9));
  if (!Number.isFinite(lambda)) throw new TypeError('--lambda=<n> is required (use the value selected in Task 7)');

  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const out = runPermutedAlgebra({ blueprints, bridges, lambda, permutations: 20, seed: 0x51554152 });

  console.log('Falsifier 4 — permuted relation algebra');
  console.log(`  real rules            ${out.real.rules}`);
  console.log(`  real shortlist        ${out.real.shortlist}`);
  console.log(`  permuted runs         ${out.permuted.runs}`);
  console.log(`  KS d                  ${out.ks.d}`);
  console.log(`  KS p                  ${out.ks.p}   (threshold ${BONFERRONI_THRESHOLD})`);
  console.log(`  verdict               ${out.verdict}`);
  if (out.verdict === 'INDISTINGUISHABLE_FROM_NOISE') {
    console.log('\n  The algebra carries no information. Per the prereg the chamber is a noise');
    console.log('  injector and the design fails at F4.');
  }

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    falsifier: 'F4-permuted-relation-algebra',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    lambda,
    ...out,
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`  written → ${OUTPUT_PATH}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/permuted-algebra.test.js
```

Expected: PASS.

- [ ] **Step 5: Run the falsifier with the λ selected in Task 7**

```bash
node scripts/quark-permuted-algebra.mjs --lambda=<selected>
```

Report the verdict. `INDISTINGUISHABLE_FROM_NOISE` is a refutation and must be reported as one.

- [ ] **Step 6: Commit**

```bash
git add scripts/quark-permuted-algebra.mjs \
        tests/codex/core/pixelbrain/quark-chamber/permuted-algebra.test.js \
        docs/superpowers/evidence/2026-08-12-quark-permuted-algebra.json
git commit -m "test(quark-chamber): falsifier 4 — permuted relation algebra control

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 11: Layer 4 — does the ceiling move?

The design's whole premise is section 1.2: 21,304 additional molecules moved `maximumIntrinsicEnergy` **by zero at six decimals**, because the ceiling is a property of the graph, not the sampling. This task widens the graph and measures the same number.

**The confound, and why it resolves.** `osmosisConcentrationLimit` is calibrated per bank and is explicitly *not portable* — `requireConcentrationLimit` refuses to supply a default and says so. Adding quark bridges changes the graph, so `FULL_BANK_CONCENTRATION_LIMIT` strictly speaking no longer describes it, and `scripts/calibrate-osmotic-membrane.mjs` **exports nothing reusable** (verified 2026-08-12 — it is a `main()`-only script).

Both arms therefore run at `FULL_BANK_CONCENTRATION_LIMIT`, and the confound is *measured away* rather than assumed away. The limit governs only when the entropy dampener fires, and the design's own §1.2 already established that the dampener moves `maximumEnergy` **by zero at six decimals** across 100k trials. Step 6 re-confirms that on this bank by running the baseline at two different limits: if the ceiling is identical, the limit cannot be confounding the comparison, and this is checked rather than asserted.

**Files:**
- Create: `scripts/quark-ceiling-test.mjs`
- Test: `tests/codex/core/pixelbrain/quark-chamber/ceiling-test.test.js`

**Interfaces:**
- Consumes: `generateQuarkCandidates` (Task 2); `composeRelation`, `RELAY_RELATION` (Task 6); `relayStrength`, `MIN_AUTHORED_STRENGTH` (Task 7); `runSemanticValenceCyclotron` and `FULL_BANK_CONCENTRATION_LIMIT`. It builds its rules with a local `derivedRulesFor` rather than importing Task 7's `quarkBridgeRules`, so the experiment does not depend on the sweep script's internals.
- Produces: `runCeilingTest({blueprints, bridges, derivedRules, trials, seed, concentrationLimit}) => {baseline, treatment, deltaCeiling, verdict, derivedRules}`.

- [ ] **Step 1: Write the failing test**

Create `tests/codex/core/pixelbrain/quark-chamber/ceiling-test.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { runCeilingTest } from '../../../../../scripts/quark-ceiling-test.mjs';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('ceiling test', () => {
  it('reports zero delta when no rule is added', () => {
    const out = runCeilingTest({ blueprints, bridges, derivedRules: [], trials: 2000, seed: 7 });
    expect(out.deltaCeiling).toBe(0);
    expect(out.verdict).toBe('CEILING_UNMOVED');
  });

  it('measures the ceiling at six decimals, matching the design section 1.2 statistic', () => {
    const out = runCeilingTest({ blueprints, bridges, derivedRules: [], trials: 2000, seed: 7 });
    expect(out.baseline.maximumEnergy).toBeGreaterThan(0);
    expect(String(out.baseline.maximumEnergy).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6);
  });

  it('reports both arms at the same declared limit', () => {
    const out = runCeilingTest({ blueprints, bridges, derivedRules: [], trials: 2000, seed: 7 });
    expect(out.baseline.concentrationLimit).toBe(out.treatment.concentrationLimit);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/ceiling-test.test.js
```

Expected: FAIL — unresolved import.

- [ ] **Step 3: Write the implementation**

Create `scripts/quark-ceiling-test.mjs`:

```js
#!/usr/bin/env node

/**
 * LAYER 4 — does widening the graph move the ceiling?
 *
 * The design's whole premise is section 1.2: 21,304 additional molecules moved
 * `maximumIntrinsicEnergy` BY ZERO at six decimals, because the ceiling is a
 * property of the graph, not of the sampling. This widens the graph and
 * measures the same number.
 *
 * Read the result honestly. Relays are weaker than every authored bridge BY
 * CONSTRUCTION, so they lower mean linkStrength. The ceiling rises only if
 * newly-reachable atom combinations earn back more in grounding and novelty
 * than they lose in strength. CEILING_FELL and CEILING_UNMOVED are real
 * outcomes, not bugs to be tuned away.
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { runSemanticValenceCyclotron } from '../codex/core/pixelbrain/semantic-valence-cyclotron.js';
import { generateQuarkCandidates } from '../codex/core/pixelbrain/quark-chamber/slingshot.js';
import { composeRelation, RELAY_RELATION } from '../codex/core/pixelbrain/quark-chamber/relation-algebra.js';
import { relayStrength, MIN_AUTHORED_STRENGTH } from '../codex/core/pixelbrain/quark-chamber/relay-strength.js';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from './semantic-valence-cyclotron.mjs';
import { buildDefaultBank, FULL_BANK_CONCENTRATION_LIMIT } from '../codex/core/pixelbrain/codebase-nuclei-bank.js';
import { sha256Hex } from '../codex/core/immunity/cleri-probe/canonical-report.js';

const PREREG_PATH = 'docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md';
const OUTPUT_PATH = 'docs/superpowers/evidence/2026-08-12-quark-ceiling-test.json';
const TRIALS = 100_000;
const SEED = 0x5c4010;

const round6 = (value) => Math.round(value * 1e6) / 1e6;

function arm(blueprints, bridgeRules, trials, seed, concentrationLimit) {
  const report = runSemanticValenceCyclotron({
    atoms: blueprints,
    bridgeRules,
    trialCount: trials,
    seed,
    osmosisConcentrationLimit: concentrationLimit,
  });
  return {
    maximumEnergy: report.searchLandscape.intrinsicQuality.maximumEnergy,
    meanNovelty: report.searchLandscape.intrinsicQuality.meanNovelty,
    controlBar: report.control.bar,
    candidates: report.candidates.length,
    concentrationLimit,
  };
}

export function runCeilingTest({
  blueprints, bridges, derivedRules, trials, seed,
  concentrationLimit = FULL_BANK_CONCENTRATION_LIMIT,
}) {
  const baseline = arm(blueprints, bridges, trials, seed, concentrationLimit);
  const treatment = arm(blueprints, [...bridges, ...derivedRules], trials, seed, concentrationLimit);
  const deltaCeiling = round6(treatment.maximumEnergy - baseline.maximumEnergy);
  const verdict = deltaCeiling > 0 ? 'CEILING_ROSE' : deltaCeiling === 0 ? 'CEILING_UNMOVED' : 'CEILING_FELL';
  return { baseline, treatment, deltaCeiling, verdict, derivedRules: derivedRules.length };
}

function derivedRulesFor(blueprints, bridges, lambda) {
  const rules = [];
  for (const candidate of generateQuarkCandidates(blueprints, bridges, {})) {
    const cell = candidate.compositions.find((entry) => {
      const [relA, relB] = entry.split('|');
      return composeRelation(relA, relB) !== null;
    });
    if (!cell) continue;
    const composed = cell.split('|').map((rel) => (rel === 'satisfies' ? 1 : MIN_AUTHORED_STRENGTH));
    rules.push({
      from: candidate.from, to: candidate.to, relation: RELAY_RELATION,
      strength: relayStrength(lambda, composed),
    });
  }
  return rules;
}

function main() {
  const lambda = Number(process.argv.slice(2).find((a) => a.startsWith('--lambda='))?.slice(9));
  if (!Number.isFinite(lambda)) throw new TypeError('--lambda=<n> is required (use the value selected in Task 7)');

  const { blueprints, bridges } = buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});
  const derived = derivedRulesFor(blueprints, bridges, lambda);
  const out = runCeilingTest({ blueprints, bridges, derivedRules: derived, trials: TRIALS, seed: SEED });

  console.log('Layer 4 — does the ceiling move?');
  console.log(`  derived rules         ${out.derivedRules}`);
  console.log(`  baseline ceiling      ${out.baseline.maximumEnergy}`);
  console.log(`  treatment ceiling     ${out.treatment.maximumEnergy}`);
  console.log(`  delta                 ${out.deltaCeiling}`);
  console.log(`  verdict               ${out.verdict}`);

  // Sensitivity: the membrane limit governs only when the entropy dampener fires,
  // and section 1.2 measured the dampener moving this ceiling by zero. Confirm the
  // limit is not confounding THIS comparison rather than assuming it.
  const alternate = runCeilingTest({
    blueprints, bridges, derivedRules: [], trials: TRIALS, seed: SEED,
    concentrationLimit: 0.90,
  });
  const limitIsInert = alternate.baseline.maximumEnergy === out.baseline.maximumEnergy;
  console.log(`  ceiling at limit 0.90 ${alternate.baseline.maximumEnergy}  `
    + `→ limit ${limitIsInert ? 'is inert for the ceiling (comparison is clean)' : 'MOVES THE CEILING — comparison is confounded'}`);

  const body = {
    contract: 'PB-QUARK-CHAMBER-v1',
    experiment: 'L4-ceiling',
    prereg: PREREG_PATH,
    preregSha256: sha256Hex(readFileSync(PREREG_PATH, 'utf8')),
    lambda,
    trials: TRIALS,
    seed: SEED,
    ...out,
    sensitivity: { alternateLimit: 0.90, ceiling: alternate.baseline.maximumEnergy, limitIsInert },
  };
  writeFileSync(OUTPUT_PATH, `${JSON.stringify({ ...body, checksum: sha256Hex(body) }, null, 2)}\n`);
  console.log(`  written → ${OUTPUT_PATH}`);
  if (!limitIsInert) {
    console.log('\n  The membrane limit moves the ceiling on this bank, contradicting section 1.2.');
    console.log('  The ceiling comparison above is confounded. Report this rather than the delta.');
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) main();
```

- [ ] **Step 4: Run the tests, then the experiment**

```bash
npx vitest run tests/codex/core/pixelbrain/quark-chamber/ceiling-test.test.js
node scripts/quark-ceiling-test.mjs --lambda=<selected>
```

**Interpret honestly.** Relays are weaker than every authored bridge by construction, so they *lower* mean `linkStrength`. The ceiling rises only if newly-reachable atom combinations earn back more in grounding and novelty than they lose in strength. `CEILING_FELL` and `CEILING_UNMOVED` are both real outcomes and neither is a bug to be tuned away. Report the measured delta whatever it is.

- [ ] **Step 5: Commit**

```bash
git add scripts/quark-ceiling-test.mjs \
        tests/codex/core/pixelbrain/quark-chamber/ceiling-test.test.js \
        docs/superpowers/evidence/2026-08-12-quark-ceiling-test.json
git commit -m "test(quark-chamber): layer 4 — does widening the graph move the ceiling

Both arms run at the same declared membrane limit, and the run measures whether
that limit is inert for the ceiling rather than assuming it. The design's
section 1.2 predicts it is; if it is not, the comparison is confounded and the
script says so instead of reporting a delta.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Final verification

- [ ] **Run the whole pixelbrain suite**

```bash
npx vitest run tests/codex/core/pixelbrain
```

Expected: 0 failed. Baseline before this plan was 12 failed / 1321 passed; Task 1 closes those and Tasks 2–11 add only passing tests.

- [ ] **Run the repo's own intelligence check**

```bash
npm run scd64:intellisense
```

- [ ] **Confirm no scoring term was added**

This plan starts at commit `613b2931`. The cyclotron must be untouched by every task in it:

```bash
git diff 613b2931 -- codex/core/pixelbrain/semantic-valence-cyclotron.js
```

Expected: **empty**. If this file changed at all, a global constraint was violated — derived bonds are supposed to reach the score only through the `strength` they carry into the existing `0.40 · linkStrength` term.

- [ ] **Confirm the four falsifier verdicts are recorded**

```bash
ls docs/superpowers/evidence/2026-08-12-quark-*.json
```

Expected: `authored-recovery`, `confinement-null`, `lambda-sweep`, `permuted-algebra`, `ceiling-test`.

## Open questions carried forward from the spec

These are **not** implemented in v1 and are recorded so they are not silently lost:

- **Depth.** Depth 2 yields 132 confined and depth 3 yields 390, both clearing F9's floor of 40. Neither has been run against the configuration null, and part of the rise is mechanical — more paths mean more chances at ≥2 witnesses. Depth 2 is the obvious v2 candidate. `generateQuarkCandidates` throws on `depth !== 1` precisely so this cannot be enabled by accident.
- **Bank growth.** If depth 2 does not survive its null, reaching 40 resolved grants requires more atoms.
- **`relays` in `composeVector`.** `composeVector` builds a relation vector per `offer|relation|seek`, so `relays` generates new keys automatically and v1 requires no code for this. Whether relayed bonds *should* contribute a distinct relation vector or reuse the composed edges' vectors is unresolved and affects novelty measurement directly — Task 11's measurement is taken under the automatic behaviour, and that is a choice, not a neutral default.
