# Concept Chemistry APM Hourly Scoring Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Companion document:** `docs/superpowers/specs/2026-08-03-concept-chemistry-apm-hourly-reporter-design.md`.
Read it before starting. It freezes the prospective experiment; this plan implements only its scoring gate.

**Goal:** Run the frozen Concept Chemistry experiment against the real Scholomance encyclopedia, preserve immutable evidence, and authorize a winner-specific hourly-reporter implementation plan if and only if every prospective gate passes.

**Architecture:** A frozen reaction-matrix module owns all 21 candidate/control reactions and a pure evaluator. A thin CLI loads the production encyclopedia index, calls the unmodified `PB-CONCEPT-CHEM-v1` engine, evaluates all gates, and writes one content-addressed evidence record exactly once. Reporter code is outside this plan and is forbidden until the evidence selects an architecture.

**Tech Stack:** Node.js 20+ ESM, Vitest 4.0.18, `PB-CONCEPT-CHEM-v1`, `PB-GROUNDING-v1`, `PB-SIM-CONTROLGATE-v1`, Node `crypto`/`fs`, Git metadata.

---

## Global Constraints

- Do not modify `codex/core/pixelbrain/concept-chemistry.js`, its weights, `STABLE_MIN`, the corpus, or the approved reaction wording.
- Use `loadEncyclopediaIndex(repoRoot)` followed by `prepareForSynthesize(index)`. Hand-authored grounding and explicit `groundingA`/`groundingB` values are prohibited.
- There are exactly three aligned rounds. V1 reactions run together, then V2, then V3.
- Each round contains three candidates, three bar controls, and one law control.
- Candidate ranking is strict. A tie for first is a failed round, not an invitation to add a tie-breaker.
- The same architecture must be the unique first-place candidate in all three rounds.
- In each round, the winner's feasibility must be strictly greater than every bar-setting control. `computeControlBar()` must exclude the law control from that bar.
- Every law control's `lawNote` must start with `LAW_VIOLATION`.
- The common winner's median feasibility must be at least the imported `STABLE_MIN` (`0.55`). This experiment intentionally uses both the local control boundary and the frozen absolute stability threshold.
- Calculate and record every gate even when another gate fails. Never stop evaluation early and leave an ambiguous evidence record.
- `selectedArchitecture` is non-null only when all gates pass. There is no fallback candidate.
- The production evidence path is `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`.
- Evidence is immutable: refuse if the destination exists, create the final name atomically, and never expose a partial JSON file.
- A failed experiment still writes evidence and exits with status 2. Infrastructure/input errors exit with status 1.
- Do not create or modify any file under `divtube_downloader/APM-Hourly-Reports` in this plan.
- Do not execute the production scoring command until Tasks 1–4 pass, the worktree diff has been reviewed, and the reaction/design/engine checksums are about to be captured.
- The repository is already dirty. Stage only task-owned files; never use `git add -A`.
- Follow the collaboration contract: heartbeat before work, task notes for state changes, locks before edits, release locks after each owned file is complete, and run the immunity scan before every commit.

## File Structure

| File | Responsibility |
|---|---|
| `scripts/lib/concept-chem-apm-hourly-experiment.mjs` | Frozen 21-reaction matrix, score projection, median, and pure gate evaluator |
| `scripts/concept-chem-apm-hourly-reporter.mjs` | Production corpus loading, checksums, scoring orchestration, immutable evidence writer, exit codes |
| `tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js` | Matrix-integrity and evaluator gate tests using injected scores |
| `tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js` | Corpus-path, metadata, evidence writer, and CLI result tests using temporary destinations |
| `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json` | One production scoring result, created only in Task 5 |

## Frozen Public Contracts

`scripts/lib/concept-chem-apm-hourly-experiment.mjs` exports:

```js
export const EXPERIMENT_SCHEMA = 'PB-CONCEPT-CHEM-APM-HOURLY-v1';
export const EXPERIMENT_ID = 'concept-chemistry-apm-hourly-reporter-2026-08-03';
export const ARCHITECTURES = Object.freeze([
  'stateless-chronicle-compiler',
  'checkpointed-window-aggregator',
  'streaming-materialized-view',
]);
export const ROUNDS; // deeply frozen, exactly 3 rounds × 7 reactions
export function median(values) {}
export function scoreRounds({ rounds = ROUNDS, scoreReaction }) {}
export function evaluateExperiment({ scoredRounds, stableMin }) {}
```

Each reaction has this shape:

```js
{
  id: 'A-V1',
  variant: 1,
  kind: 'candidate', // or 'control'
  architecture: 'stateless-chronicle-compiler', // candidates only
  controlType: undefined, // 'nonsense' | 'current-window-only' | 'raw-ledger-copy' | 'law-violation'
  controlId: undefined, // controls use `control/law-violation/L-V1` form for control-gate detection
  a: '...',
  b: '...',
  product: '...',
}
```

`scoreRounds()` calls the injected scorer once for each reaction and returns three rounds in source order. Each scored reaction preserves the frozen identity fields and all engine evidence, including `feasibility`, `stability`, `lawNote`, `grounding`, `bond`, `coherence`, and `checksum`.

`evaluateExperiment()` returns:

```js
{
  passed: true,
  selectedArchitecture: 'stateless-chronicle-compiler',
  candidateMedians: {
    'stateless-chronicle-compiler': 0.61,
    'checkpointed-window-aggregator': 0.57,
    'streaming-materialized-view': 0.53,
  },
  rounds: [{
    round: 1,
    winner: 'stateless-chronicle-compiler',
    uniqueWinner: true,
    winnerFeasibility: 0.60,
    barControlId: 'control/current-window-only/S-V1',
    barFeasibility: 0.42,
    winnerBeatsBar: true,
    lawControlsCaught: true,
  }],
  gates: {
    threeAlignedRounds: { passed: true, detail: '3/3 rounds have the frozen 3+3+1 shape' },
    uniqueWinnerEveryRound: { passed: true, detail: 'all rounds have one strict first place' },
    sameWinnerEveryRound: { passed: true, detail: 'stateless-chronicle-compiler won rounds 1, 2, 3' },
    winnerBeatsBarEveryRound: { passed: true, detail: 'strictly above all bar controls in rounds 1, 2, 3' },
    lawControlsCaughtEveryRound: { passed: true, detail: 'all 3 law controls returned LAW_VIOLATION' },
    winnerMedianStable: { passed: true, detail: '0.61 >= STABLE_MIN 0.55' },
  },
  failures: [],
}
```

All numeric examples above are illustrative test-fixture values, not predicted production results.

The production evidence record has this shape:

```js
{
  schema: 'PB-CONCEPT-CHEM-APM-HOURLY-EVIDENCE-v1',
  experimentId: EXPERIMENT_ID,
  recordedAt: now().toISOString(), // observation metadata; excluded from scoring
  inputs: {
    reactionMatrixChecksum: sha256(canonicalJson(ROUNDS)),
    designSpec: {
      path: 'docs/superpowers/specs/2026-08-03-concept-chemistry-apm-hourly-reporter-design.md',
      checksum: sha256(readFileSync(resolve(repoRoot, designSpecPath))),
    },
    engine: {
      schema: 'PB-CONCEPT-CHEM-v1',
      stableMin: 0.55,
      files: ['codex/core/pixelbrain/concept-chemistry.js', 'codex/core/pixelbrain/grounding-index.js', 'codex/core/pixelbrain/calibration/control-gate.js'],
      checksum: checksumFiles(repoRoot, ENGINE_FILES),
    },
    corpus: {
      schema: 'PB-GROUNDING-v1',
      checksum: rawIndex.checksum,
      documentCount: rawIndex.docCount,
      tokenCount: rawIndex.tokenCount,
    },
    git: { commit: gitCommit, dirty: gitPorcelain.length > 0, porcelain: gitPorcelain },
  },
  scoredRounds,
  decision,
  evidenceChecksum, // canonical JSON of every preceding field
}
```

`recordedAt` and Git dirtiness are provenance only and never enter a reaction score or gate.

---

## Task 1: Freeze and verify the 21-reaction matrix

**Files:**
- Create: `scripts/lib/concept-chem-apm-hourly-experiment.mjs`
- Create: `tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js`

**Interfaces:**
- Consumes the exact wording in the approved design spec.
- Produces `EXPERIMENT_SCHEMA`, `EXPERIMENT_ID`, `ARCHITECTURES`, and deeply frozen `ROUNDS`.

- [ ] **Step 1: Write the failing matrix-integrity tests**

Create the test file with these assertions before creating the module:

```js
import { describe, expect, it } from 'vitest';
import {
  ARCHITECTURES,
  EXPERIMENT_ID,
  EXPERIMENT_SCHEMA,
  ROUNDS,
} from '../../../../scripts/lib/concept-chem-apm-hourly-experiment.mjs';

describe('frozen APM hourly reaction matrix', () => {
  it('has the stable experiment identity and exactly 3 aligned 3+3+1 rounds', () => {
    expect(EXPERIMENT_SCHEMA).toBe('PB-CONCEPT-CHEM-APM-HOURLY-v1');
    expect(EXPERIMENT_ID).toBe('concept-chemistry-apm-hourly-reporter-2026-08-03');
    expect(ARCHITECTURES).toEqual([
      'stateless-chronicle-compiler',
      'checkpointed-window-aggregator',
      'streaming-materialized-view',
    ]);
    expect(ROUNDS).toHaveLength(3);
    for (const [index, round] of ROUNDS.entries()) {
      expect(round.round).toBe(index + 1);
      expect(round.reactions).toHaveLength(7);
      expect(round.reactions.filter((r) => r.kind === 'candidate')).toHaveLength(3);
      expect(round.reactions.filter((r) => r.kind === 'control' && r.controlType !== 'law-violation')).toHaveLength(3);
      expect(round.reactions.filter((r) => r.controlType === 'law-violation')).toHaveLength(1);
      expect(round.reactions.every((r) => r.variant === index + 1)).toBe(true);
    }
  });

  it('has unique IDs and the law-control IDs remain detectable', () => {
    const reactions = ROUNDS.flatMap((round) => round.reactions);
    expect(new Set(reactions.map((r) => r.id)).size).toBe(21);
    expect(reactions.filter((r) => r.controlType === 'law-violation').map((r) => r.controlId))
      .toEqual([
        'control/law-violation/L-V1',
        'control/law-violation/L-V2',
        'control/law-violation/L-V3',
      ]);
  });

  it('preserves representative wording exactly and is deeply frozen', () => {
    expect(ROUNDS[0].reactions[0]).toMatchObject({
      id: 'A-V1',
      a: 'append-only resonance ledger preserving timestamped APM fingerprints and assessments',
      b: 'stateless closed-hour temporal fold reconstructing cumulative event history from immutable records',
      product: 'deterministic hourly Markdown chronicle emitted only for active windows, grouping stable event identities with complete recurrence timelines',
    });
    expect(ROUNDS[2].reactions.at(-1).product)
      .toBe('random hourly narratives that cannot be reproduced from the ledger');
    expect(Object.isFrozen(ROUNDS)).toBe(true);
    expect(Object.isFrozen(ROUNDS[0])).toBe(true);
    expect(Object.isFrozen(ROUNDS[0].reactions[0])).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js`

Expected: FAIL because `scripts/lib/concept-chem-apm-hourly-experiment.mjs` does not exist.

- [ ] **Step 3: Implement the frozen matrix without scoring behavior**

Create the module with a recursive freezer and the following exact matrix. Whitespace wrapping in source is allowed only if the resulting string is identical.

```js
export const EXPERIMENT_SCHEMA = 'PB-CONCEPT-CHEM-APM-HOURLY-v1';
export const EXPERIMENT_ID = 'concept-chemistry-apm-hourly-reporter-2026-08-03';

export const ARCHITECTURES = Object.freeze([
  'stateless-chronicle-compiler',
  'checkpointed-window-aggregator',
  'streaming-materialized-view',
]);

function candidate(id, variant, architecture, a, b, product) {
  return { id, variant, kind: 'candidate', architecture, a, b, product };
}

function control(id, variant, controlType, a, b, product) {
  return {
    id,
    variant,
    kind: 'control',
    controlType,
    controlId: `control/${controlType}/${id}`,
    a,
    b,
    product,
  };
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

const A = 'stateless-chronicle-compiler';
const B = 'checkpointed-window-aggregator';
const C = 'streaming-materialized-view';

export const ROUNDS = deepFreeze([
  { round: 1, reactions: [
    candidate('A-V1', 1, A,
      'append-only resonance ledger preserving timestamped APM fingerprints and assessments',
      'stateless closed-hour temporal fold reconstructing cumulative event history from immutable records',
      'deterministic hourly Markdown chronicle emitted only for active windows, grouping stable event identities with complete recurrence timelines'),
    candidate('B-V1', 1, B,
      'append-only resonance ledger preserving timestamped APM fingerprints and assessments',
      'sealed checkpoint cursor with tumbling-hour aggregation and a persistent cumulative recurrence index',
      'restart-safe hourly Markdown reporting from checkpointed event windows and historically indexed event identities'),
    candidate('C-V1', 1, C,
      'live Subtlety APM crash and route-observation event stream',
      'persistent materialized recurrence view updated atomically as each event arrives',
      'streaming APM projection producing atomic cumulative Markdown reports at machine-clock hour boundaries'),
    control('N-V1', 1, 'nonsense',
      'APM crash ledger and incident history',
      'layered pastry recipe calendar with flour icing and serving plates',
      'hourly monitoring chronicle organized as decorative frosting layers and dessert courses'),
    control('S-V1', 1, 'current-window-only',
      'hourly APM reporting',
      'isolated current-window event counter without historical state',
      'Markdown snapshot containing only the completed hour and omitting every prior recurrence'),
    control('R-V1', 1, 'raw-ledger-copy',
      'append-only APM resonance JSONL',
      'hourly file copy with a Markdown filename',
      'ungrouped raw ledger duplication presented as a human incident report'),
    control('L-V1', 1, 'law-violation',
      'APM event history',
      'unseeded random selection and destructive rewriting of earlier records',
      'hourly reports generated by random sampling until incidents look plausible'),
  ]},
  { round: 2, reactions: [
    candidate('A-V2', 2, A,
      'immutable chronological store of Subtlety observations and evaluations',
      'pure completed-hour reduction rebuilding recurrence context from all prior entries',
      'content-addressed Markdown incident chronicle for nonempty local hour windows with full previous occurrence times'),
    candidate('B-V2', 2, B,
      'immutable chronological store of Subtlety observations and evaluations',
      'durable cursor advancing across completed hourly buckets while an indexed recurrence table retains prior event times',
      'hour-boundary Markdown reports produced from a recoverable checkpoint and cumulative identity index'),
    candidate('C-V2', 2, C,
      'Subtlety observations delivered continuously as failures and assessments occur',
      'durable query projection maintaining per-identity occurrence timelines during ingestion',
      'atomic machine-hour Markdown snapshots rendered from a live cumulative incident view'),
    control('N-V2', 2, 'nonsense',
      'Subtlety fingerprints and runtime assessments',
      'garden planting almanac for herbs flowers and watering cans',
      'operational failure reports grouped by garden beds and bouquet arrangements'),
    control('S-V2', 2, 'current-window-only',
      'top-of-hour Subtlety status summary',
      'ephemeral bucket discarded after its current counts are printed',
      'incident report that forgets previous appearances of active errors'),
    control('R-V2', 2, 'raw-ledger-copy',
      'persistent Subtlety fingerprint records',
      'verbatim text export at each clock boundary',
      'Markdown artifact with no stable event grouping or recurrence timeline'),
    control('L-V2', 2, 'law-violation',
      'Subtlety resonance ledger',
      'arbitrary deletion of prior failures and stochastic event selection',
      'nondeterministic monitoring summaries that erase inconvenient history'),
  ]},
  { round: 3, reactions: [
    candidate('A-V3', 3, A,
      'durable append-only APM history of observed failures and assessments',
      'replayable stateless window compiler deriving active event groups from the complete log',
      'idempotent local-hour Markdown reports that omit quiet hours and list cumulative recurrence histories'),
    candidate('B-V3', 3, B,
      'durable append-only APM history of observed failures and assessments',
      'transactional checkpoint plus persistent recurrence table incrementally folding newly appended records',
      'restart-resilient nonempty-hour Markdown summaries with historical occurrence lists'),
    candidate('C-V3', 3, C,
      'continuous APM stream of timestamped fingerprints',
      'event-driven persistent read model grouping identities and appending recurrence times',
      'nonempty hourly Markdown reports emitted from a streaming historical projection'),
    control('N-V3', 3, 'nonsense',
      'timestamped software-error observations',
      'wardrobe catalogue sorted by fabric buttons and seasonal colors',
      'cumulative APM incidents rendered as clothing combinations and tailoring patterns'),
    control('S-V3', 3, 'current-window-only',
      'scheduled monitoring report',
      'one-hour-only aggregation with no cumulative event identity',
      'local-hour Markdown counts that cannot show whether an issue is ongoing'),
    control('R-V3', 3, 'raw-ledger-copy',
      'chronological monitoring data',
      'scheduled replication of every source line',
      'hourly report that copies storage syntax without compiling operational meaning'),
    control('L-V3', 3, 'law-violation',
      'cumulative incident evidence',
      'unseeded shuffling with mutable replacement of previous observations',
      'random hourly narratives that cannot be reproduced from the ledger'),
  ]},
]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js`

Expected: PASS for all matrix-integrity tests.

- [ ] **Step 5: Cross-check every string against the approved spec**

Run:

```bash
git diff --check
rg -n "^    (candidate|control)\('" scripts/lib/concept-chem-apm-hourly-experiment.mjs
```

Expected: 21 reaction constructors and no whitespace errors. Manually compare A/B/Product values to the frozen matrix in the companion design before committing.

- [ ] **Step 6: Immunity-scan and commit only Task 1 files**

```bash
git add scripts/lib/concept-chem-apm-hourly-experiment.mjs tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js
git commit -m "test: freeze APM hourly concept chemistry matrix"
```

---

## Task 2: Implement the pure scorer projection and decision gates

**Files:**
- Modify: `scripts/lib/concept-chem-apm-hourly-experiment.mjs`
- Modify: `tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js`

**Interfaces:**
- `median(number[]) -> number`; throws on empty/non-finite input.
- `scoreRounds({ rounds, scoreReaction }) -> scoredRounds`; rejects async/non-object/malformed score results.
- `evaluateExperiment({ scoredRounds, stableMin }) -> decision`; has no I/O and never calls the Concept Chemistry engine.

- [ ] **Step 1: Add failing tests for median and score projection**

```js
import { evaluateExperiment, median, scoreRounds } from '../../../../scripts/lib/concept-chem-apm-hourly-experiment.mjs';

it('computes odd and even medians without mutating input', () => {
  const values = [0.9, 0.3, 0.6];
  expect(median(values)).toBe(0.6);
  expect(median([0.8, 0.4])).toBe(0.6);
  expect(values).toEqual([0.9, 0.3, 0.6]);
  expect(() => median([])).toThrow(/non-empty/);
});

it('scores every frozen reaction exactly once and preserves matrix order', () => {
  const seen = [];
  const scored = scoreRounds({
    scoreReaction(reaction) {
      seen.push(reaction.id);
      return {
        feasibility: 0.5,
        stability: 'METASTABLE',
        lawNote: reaction.controlType === 'law-violation' ? 'LAW_VIOLATION:random' : 'LAW_NEUTRAL',
        grounding: 0.5,
        bond: 0,
        coherence: 0.5,
        checksum: `synth1:${reaction.id}`,
      };
    },
  });
  expect(seen).toEqual(ROUNDS.flatMap((round) => round.reactions.map((r) => r.id)));
  expect(scored[0].reactions[0]).toMatchObject({ id: 'A-V1', feasibility: 0.5 });
});
```

- [ ] **Step 2: Run the focused test and confirm RED**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js`

Expected: FAIL because the new functions are not exported.

- [ ] **Step 3: Implement `median()` and `scoreRounds()` minimally**

Requirements:

```js
export function median(values) {
  if (!Array.isArray(values) || values.length === 0 || values.some((n) => !Number.isFinite(n))) {
    throw new TypeError('median requires a non-empty array of finite numbers');
  }
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 1
    ? ordered[middle]
    : (ordered[middle - 1] + ordered[middle]) / 2;
}

export function scoreRounds({ rounds = ROUNDS, scoreReaction }) {
  if (typeof scoreReaction !== 'function') throw new TypeError('scoreReaction must be a function');
  return rounds.map((round) => ({
    round: round.round,
    reactions: round.reactions.map((reaction) => {
      const score = scoreReaction(reaction);
      if (!score || typeof score !== 'object' || !Number.isFinite(score.feasibility)) {
        throw new TypeError(`invalid score for ${reaction.id}`);
      }
      return Object.freeze({ ...reaction, ...score });
    }),
  }));
}
```

Do not add sorting to `scoreRounds()`; evidence preserves frozen matrix order.

- [ ] **Step 4: Add the passing decision fixture and all four falsification tests**

Use a helper that assigns scores by architecture/control type while retaining the real frozen matrix:

```js
function fixtureScores({
  winners = ['stateless-chronicle-compiler', 'stateless-chronicle-compiler', 'stateless-chronicle-compiler'],
  winnerScores = [0.60, 0.61, 0.62],
  lawCaught = [true, true, true],
  barScores = [0.42, 0.43, 0.44],
} = {}) {
  return scoreRounds({
    scoreReaction(reaction) {
      const roundIndex = reaction.variant - 1;
      let feasibility = 0.30;
      if (reaction.kind === 'candidate') {
        feasibility = reaction.architecture === winners[roundIndex]
          ? winnerScores[roundIndex]
          : 0.40 - ARCHITECTURES.indexOf(reaction.architecture) * 0.01;
      } else if (reaction.controlType === 'law-violation') {
        feasibility = 0;
      } else {
        feasibility = barScores[roundIndex] - ['nonsense', 'current-window-only', 'raw-ledger-copy'].indexOf(reaction.controlType) * 0.01;
      }
      return {
        feasibility,
        stability: feasibility >= 0.55 ? 'STABLE' : feasibility >= 0.30 ? 'METASTABLE' : 'UNSTABLE',
        lawNote: reaction.controlType === 'law-violation'
          ? (lawCaught[roundIndex] ? 'LAW_VIOLATION:random' : 'LAW_NEUTRAL')
          : 'LAW_NEUTRAL',
        grounding: 0.5,
        bond: 0.1,
        coherence: 0.4,
        checksum: `synth1:${reaction.id}`,
      };
    },
  });
}

it('passes only the common winner that clears every frozen gate', () => {
  const decision = evaluateExperiment({ scoredRounds: fixtureScores(), stableMin: 0.55 });
  expect(decision.passed).toBe(true);
  expect(decision.selectedArchitecture).toBe('stateless-chronicle-compiler');
  expect(Object.values(decision.gates).every((gate) => gate.passed)).toBe(true);
  expect(decision.failures).toEqual([]);
});

it.each([
  ['changing winner', { winners: ['stateless-chronicle-compiler', 'checkpointed-window-aggregator', 'stateless-chronicle-compiler'] }, 'sameWinnerEveryRound'],
  ['winner below a bar control', { winnerScores: [0.60, 0.42, 0.62], barScores: [0.42, 0.43, 0.44] }, 'winnerBeatsBarEveryRound'],
  ['missed law violation', { lawCaught: [true, false, true] }, 'lawControlsCaughtEveryRound'],
  ['median below STABLE', { winnerScores: [0.52, 0.53, 0.54] }, 'winnerMedianStable'],
])('fails on %s without selecting a fallback', (_label, fixture, failedGate) => {
  const decision = evaluateExperiment({ scoredRounds: fixtureScores(fixture), stableMin: 0.55 });
  expect(decision.passed).toBe(false);
  expect(decision.selectedArchitecture).toBeNull();
  expect(decision.gates[failedGate].passed).toBe(false);
  expect(decision.failures).toContain(failedGate);
});

it('fails a first-place tie instead of breaking it alphabetically', () => {
  const scored = fixtureScores();
  const tied = scored.map((round, roundIndex) => ({
    ...round,
    reactions: round.reactions.map((reaction) => (
      roundIndex === 0 && reaction.kind === 'candidate'
        ? { ...reaction, feasibility: 0.60 }
        : { ...reaction }
    )),
  }));
  const decision = evaluateExperiment({ scoredRounds: tied, stableMin: 0.55 });
  expect(decision.gates.uniqueWinnerEveryRound.passed).toBe(false);
  expect(decision.selectedArchitecture).toBeNull();
});
```

The tie fixture clones round/reaction objects and never mutates frozen production results.

- [ ] **Step 5: Run the focused test and confirm RED**

Expected: FAIL because `evaluateExperiment()` is not implemented.

- [ ] **Step 6: Implement `evaluateExperiment()` using the production control gate**

Import:

```js
import { computeControlBar } from '../../codex/core/pixelbrain/calibration/control-gate.js';
```

For each round:

1. Validate the frozen `3 candidates + 3 bar controls + 1 law control` shape and aligned variant number.
2. Rank candidates by descending feasibility only for inspection.
3. Mark `uniqueWinner` false when the two highest feasibility values are equal.
4. Convert controls into `computeControlBar()` input using `id: reaction.controlId`, `kind: 'control'`, `feasibility`, and `lawNote`, then call it with `{ groupKey: 'kind' }`.
5. Record `winnerBeatsBar` with strict `>`.
6. Record `lawControlsCaught` by checking every law note with `startsWith('LAW_VIOLATION')` and require `findings.length === 0`.
7. Calculate all candidate medians from the three variants.
8. Build all six gate objects and `failures` in the declared key order.
9. Set `selectedArchitecture` only when every gate passes.

The function must throw on malformed input (wrong round count, unknown architecture, missing/non-finite feasibility). A valid negative experiment is returned as `passed: false`; malformed evidence is an infrastructure error and is thrown.

- [ ] **Step 7: Verify all experiment tests pass and output is deterministic**

Add a test that evaluates the same fixture twice and expects exact deep equality. Then run:

```bash
npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js
git diff --check
```

Expected: PASS; identical decisions for identical scores; no whitespace errors.

- [ ] **Step 8: Immunity-scan and commit only Task 2 files**

```bash
git add scripts/lib/concept-chem-apm-hourly-experiment.mjs tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js
git commit -m "feat: gate APM hourly concept chemistry scores"
```

---

## Task 3: Build the corpus-backed CLI and immutable evidence writer

**Files:**
- Create: `scripts/concept-chem-apm-hourly-reporter.mjs`
- Create: `tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js`

**Interfaces:**
- `canonicalJson(value) -> string`: recursively key-sorted JSON, arrays retain order.
- `sha256(value) -> 'sha256:<64 hex>'`.
- `checksumFiles(repoRoot, relativePaths) -> string`: sorted paths plus exact bytes.
- `writeEvidenceOnce(path, evidence) -> void`: atomic, exclusive, newline-terminated JSON.
- `buildEvidence({ repoRoot, now = () => new Date() }) -> evidence`: real corpus and real engine only.
- `run({ repoRoot, outputPath, now }) -> { exitCode, evidence }`.
- Direct CLI invocation uses repository root from `process.cwd()` and the fixed production path.

- [ ] **Step 1: Write failing tests for canonical serialization and immutable output**

```js
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  canonicalJson,
  sha256,
  writeEvidenceOnce,
} from '../../../../scripts/concept-chem-apm-hourly-reporter.mjs';

it('canonicalizes object keys while preserving array order', () => {
  expect(canonicalJson({ z: 1, a: { y: 2, b: 3 }, list: [2, 1] }))
    .toBe('{"a":{"b":3,"y":2},"list":[2,1],"z":1}');
});

it('writes one complete immutable evidence file', () => {
  const dir = mkdtempSync(join(tmpdir(), 'apm-chem-evidence-'));
  const output = join(dir, 'nested', 'score.json');
  writeEvidenceOnce(output, { schema: 'fixture', passed: true });
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ schema: 'fixture', passed: true });
  expect(() => writeEvidenceOnce(output, { schema: 'replacement' })).toThrow(/already exists/);
  expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual({ schema: 'fixture', passed: true });
});

it('produces stable SHA-256 identifiers', () => {
  expect(sha256('abc')).toBe('sha256:ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
});
```

- [ ] **Step 2: Run the CLI test and confirm RED**

Run: `npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js`

Expected: FAIL because the CLI module does not exist.

- [ ] **Step 3: Implement canonical JSON, checksums, and exclusive atomic writing**

Use `mkdirSync(dirname(path), { recursive: true })`, a same-directory temporary file opened with `flag: 'wx'`, `fsyncSync()`, and `linkSync(tempPath, finalPath)` to publish the completed inode under the final name atomically without overwrite. After linking, fsync the containing directory before removing the temporary name. Always unlink the temporary name in `finally`. Translate `EEXIST` into `evidence already exists: <path>`. Store human-readable two-space-indented JSON with one trailing newline; calculate `evidenceChecksum` over canonical JSON before that formatting newline.

Do not use `renameSync(tempPath, finalPath)` because POSIX rename may replace an existing evidence file.

- [ ] **Step 4: Add failing metadata and real-corpus orchestration tests**

The test may call `buildEvidence()` once against the repository because the engine is deterministic and read-only:

```js
it('scores the frozen matrix with corpus grounding and records complete provenance', () => {
  const evidence = buildEvidence({
    repoRoot: process.cwd(),
    now: () => new Date('2026-08-03T12:00:00.000Z'),
  });
  expect(evidence.schema).toBe('PB-CONCEPT-CHEM-APM-HOURLY-EVIDENCE-v1');
  expect(evidence.recordedAt).toBe('2026-08-03T12:00:00.000Z');
  expect(evidence.scoredRounds).toHaveLength(3);
  expect(evidence.scoredRounds.flatMap((r) => r.reactions)).toHaveLength(21);
  expect(evidence.scoredRounds.flatMap((r) => r.reactions)
    .every((r) => r.groundingSource === 'corpus')).toBe(true);
  expect(evidence.inputs.corpus.schema).toBe('PB-GROUNDING-v1');
  expect(evidence.inputs.corpus.checksum).toMatch(/^grnd1:/);
  expect(evidence.inputs.corpus.documentCount).toBeGreaterThan(0);
  expect(evidence.inputs.engine.schema).toBe('PB-CONCEPT-CHEM-v1');
  expect(evidence.inputs.engine.stableMin).toBe(0.55);
  expect(evidence.evidenceChecksum).toMatch(/^sha256:[a-f0-9]{64}$/);
});

it('repeats every scoring field and decision exactly when only recordedAt changes', () => {
  const first = buildEvidence({ repoRoot: process.cwd(), now: () => new Date('2026-08-03T12:00:00Z') });
  const second = buildEvidence({ repoRoot: process.cwd(), now: () => new Date('2026-08-03T13:00:00Z') });
  expect(second.scoredRounds).toEqual(first.scoredRounds);
  expect(second.decision).toEqual(first.decision);
  expect(second.inputs).toEqual(first.inputs);
  expect(second.evidenceChecksum).not.toBe(first.evidenceChecksum);
});
```

- [ ] **Step 5: Implement `buildEvidence()` with production imports**

Required imports and engine call:

```js
import { synthesize, SCHEMA as ENGINE_SCHEMA, STABLE_MIN } from '../codex/core/pixelbrain/concept-chemistry.js';
import {
  loadEncyclopediaIndex,
  prepareForSynthesize,
  SCHEMA as GROUNDING_SCHEMA,
} from '../codex/core/pixelbrain/grounding-index.js';
import {
  EXPERIMENT_ID,
  ROUNDS,
  evaluateExperiment,
  scoreRounds,
} from './lib/concept-chem-apm-hourly-experiment.mjs';

const rawIndex = loadEncyclopediaIndex(repoRoot);
const index = prepareForSynthesize(rawIndex);
const scoredRounds = scoreRounds({
  rounds: ROUNDS,
  scoreReaction: ({ a, b, product }) => synthesize({ a, b, product, index }),
});
const decision = evaluateExperiment({ scoredRounds, stableMin: STABLE_MIN });
```

The engine composite checksum includes these relative paths, sorted before hashing:

```js
const ENGINE_FILES = Object.freeze([
  'codex/core/pixelbrain/calibration/control-gate.js',
  'codex/core/pixelbrain/concept-chemistry.js',
  'codex/core/pixelbrain/grounding-index.js',
]);
```

The reaction-matrix checksum is computed from `canonicalJson(ROUNDS)`. The design checksum is computed from the exact bytes of `docs/superpowers/specs/2026-08-03-concept-chemistry-apm-hourly-reporter-design.md`. The Git object ID comes from `git rev-parse HEAD`; provenance stores sorted `git status --porcelain=v1 --untracked-files=all` lines. A dirty tree is recorded, not rejected, because unrelated user work already exists and the engine/design/matrix checksums pin the scored substrate.

Before adding `evidenceChecksum`, canonicalize and hash the complete evidence payload. Never include the checksum field in its own digest.

- [ ] **Step 6: Add CLI exit-code tests through an injected evidence builder**

Refactor `run()` so tests can pass `build = buildEvidence` as an optional dependency without exposing a production flag:

```js
it.each([[true, 0], [false, 2]])('writes evidence and maps decision passed=%s to exit %i', (passed, exitCode) => {
  const dir = mkdtempSync(join(tmpdir(), 'apm-chem-run-'));
  const outputPath = join(dir, 'score.json');
  const evidence = { schema: 'fixture', decision: { passed } };
  expect(run({ repoRoot: process.cwd(), outputPath, build: () => evidence })).toEqual({ exitCode, evidence });
  expect(JSON.parse(readFileSync(outputPath, 'utf8'))).toEqual(evidence);
});
```

The direct-entry guard prints a concise summary containing the experiment ID, three winners, candidate medians, each gate pass/fail, selected architecture or `none`, and evidence path. It then assigns `process.exitCode = result.exitCode`. It catches infrastructure errors, writes the message to stderr, and assigns exit 1. It does not catch or rewrite a valid negative decision.

- [ ] **Step 7: Run focused and existing Concept Chemistry tests**

```bash
npx vitest run tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js tests/codex/core/pixelbrain/concept-chemistry.test.js
git diff --check
```

Expected: PASS. The CLI tests use temporary paths and do not create production evidence.

- [ ] **Step 8: Immunity-scan and commit only Task 3 files**

```bash
git add scripts/concept-chem-apm-hourly-reporter.mjs tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js
git commit -m "feat: record APM hourly chemistry evidence"
```

---

## Task 4: Verify the gate harness before consuming the one production run

**Files:**
- Verify only; no expected source changes.

- [ ] **Step 1: Run the complete relevant test set**

```bash
npx vitest run \
  tests/codex/core/pixelbrain/concept-chem-apm-hourly-experiment.test.js \
  tests/codex/core/pixelbrain/concept-chem-apm-hourly-reporter-cli.test.js \
  tests/codex/core/pixelbrain/concept-chemistry.test.js \
  tests/codex/server/subtlety-routes.test.js
```

Expected: all tests pass. The existing route test proves the scoring harness did not disturb the current APM ingestion surface.

- [ ] **Step 2: Verify the exact frozen cardinality and absence of hand grounding**

```bash
node --input-type=module -e "import {ROUNDS} from './scripts/lib/concept-chem-apm-hourly-experiment.mjs'; const rs=ROUNDS.flatMap(r=>r.reactions); console.log(JSON.stringify({rounds:ROUNDS.length,reactions:rs.length,candidates:rs.filter(x=>x.kind==='candidate').length,barControls:rs.filter(x=>x.kind==='control'&&x.controlType!=='law-violation').length,lawControls:rs.filter(x=>x.controlType==='law-violation').length}))"
rg -n "groundingA|groundingB|hand-authored|USE_CORPUS" scripts/concept-chem-apm-hourly-reporter.mjs scripts/lib/concept-chem-apm-hourly-experiment.mjs
```

Expected cardinality: `{"rounds":3,"reactions":21,"candidates":9,"barControls":9,"lawControls":3}`. The `rg` command returns no scoring override or optional-corpus path; documentation comments must not imply one exists.

- [ ] **Step 3: Review the complete task-owned diff and checksums**

```bash
git diff --check
git status --short
git log -3 --oneline
```

Confirm that no reporter implementation, scheduler, report folder artifact, engine edit, corpus edit, or unrelated user file is staged.

- [ ] **Step 4: Run immunity scans on both source modules and both tests**

Expected: zero violations or an explicitly resolved finding before Task 5.

- [ ] **Step 5: Record the verification checkpoint in the collaboration task**

The task note must name the exact test command, pass count, frozen reaction cardinality, and immunity-scan result. Do not mark the task done yet; the production evidence remains outstanding.

---

## Task 5: Execute exactly one production scoring run and branch on evidence

**Files:**
- Create: `docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json`
- Do not modify any reaction, engine, corpus, or design file.

- [ ] **Step 1: Confirm the evidence path does not exist**

```bash
test ! -e docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json
```

Expected: exit 0. If the file exists, do not delete, overwrite, or rerun. Verify its checksum and continue from the existing evidence.

- [ ] **Step 2: Execute the frozen experiment once**

```bash
node scripts/concept-chem-apm-hourly-reporter.mjs
```

Interpret exit codes:

- `0`: all gates passed; evidence contains exactly one selected architecture.
- `2`: the prospective hypothesis failed at least one gate; negative evidence is valid and must be preserved.
- `1`: infrastructure/input failure; inspect stderr. Because no valid decision was produced, fix only the harness defect under TDD, rerun Tasks 3–4, and then execute again. Never edit reactions, thresholds, engine, or corpus to turn exit 2 into exit 0.

- [ ] **Step 3: Verify the evidence file independently**

Run a read-only Node check that:

1. Parses JSON.
2. Removes `evidenceChecksum`.
3. Recomputes `sha256(canonicalJson(payload))` with the exported functions.
4. Confirms 3 rounds, 21 results, 9 candidates, 9 bar controls, and 3 law controls.
5. Confirms all `groundingSource` values are `corpus`.
6. Confirms `selectedArchitecture !== null` exactly when `decision.passed === true`.

Also run:

```bash
git diff --check
git status --short docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json
```

- [ ] **Step 4: Immunity-scan and commit the immutable evidence alone**

```bash
git add docs/superpowers/evidence/concept-chemistry-apm-hourly-reporter/score.json
git commit -m "evidence: score APM hourly reporter architectures"
```

- [ ] **Step 5A: If the gate passes, stop implementation and write the next plan**

Record the selected architecture and all six passing gate details in the collaboration task. Mark this scoring-gate task done. Create a new planning task and write a winner-specific TDD implementation plan covering the 16 acceptance tests from the companion design.

Do not implement the hourly reporter in the same change or reuse candidate-specific internals from a losing architecture.

- [ ] **Step 5B: If the gate fails, stop the experiment**

Record every failed gate and candidate median in the collaboration task. Mark this scoring-gate task done with a negative result. Do not write a reporter implementation plan, substitute another candidate, paraphrase reactions, lower `STABLE_MIN`, or alter control membership.

The negative evidence is a valid outcome: it falsifies this prospective attempt without claiming that Concept Chemistry or hourly reporting is impossible in general.

---

## Final Verification Checklist

- [ ] The approved design, reaction matrix, engine, thresholds, and corpus were not changed after the experiment began.
- [ ] Exactly 21 reactions were scored with corpus grounding.
- [ ] Each reaction preserves feasibility, stability, law note, grounding, bond, coherence, and checksum.
- [ ] Every gate has an explicit pass/fail record and explanatory detail.
- [ ] Law controls were detectors and never bar setters.
- [ ] The winner beat every bar control strictly in every round.
- [ ] `selectedArchitecture` is present if and only if all gates passed.
- [ ] Production evidence was written once, verified, immunity-scanned, and committed alone.
- [ ] No APM hourly reporter implementation or report file was created by this plan.
- [ ] The collaboration task contains test evidence and the final positive or negative decision.
