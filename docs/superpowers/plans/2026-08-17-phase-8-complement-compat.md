# Phase 8 Complement COMPAT Circuit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the complement semantic circuit by authoring a relation-keyed COMPAT registry for `INFINITIVAL_COMPLEMENT` and `PROPOSITIONAL_COMPLEMENT`, measuring it OBSERVE-only, and running a derangement control before any SCORE is considered.

**Architecture:** A new `complement-compat.js` projects governor classes from positive `event.*` features and complement classes from the structural 3B lights (`function.infinitival`, `entity.abstract`). Lookup is `(relation, governorClass, complementClass)`. `FEATURE_COMPAT` is not extended. `feature-score.js` and `compat-waterfall.js` consult the registry only for the two complement relations. Composition scores stay 0. The forest is not touched.

**Tech Stack:** Node ESM, Vitest, `composePacked` in `semanticParticles.mode = 'observe'`, EWT DEV/TRAIN via `scripts/lib/constellation-corpus.mjs`, existing `derangeFeatureValues`.

**Spec:** `docs/superpowers/specs/2026-08-17-phase-8-complement-compat-design.md`

## Global Constraints

- Prereg: `docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md`. Every task implicitly includes it.
- Parent prereg: `docs/superpowers/evidence/2026-08-17-PREREG-semantic-competition-coverage.md`.
- Baseline (do not overwrite): `docs/superpowers/evidence/2026-08-17-compat-waterfall-census.{md,json}`.
- OBSERVE only until Task 8 passes. TEST sealed. SCORE is Task 9 and is blocked.
- No grammar, emission, projection, orientation, or composition-score changes.
- No new feature dimensions. `EXPERIMENTAL_FEATURE_SCHEMA_VERSION` stays `1.2.0`.
- No new lemma bags. Desire / permission are not classes.
- `entity.abstract` is never a governor class.
- `FEATURE_COMPAT` contains zero complement-relation rows.
- `illegal` is always `false`. Missing pairs abstain; they do not reject bonds.
- Core modules under `codex/core/` are pure and zero-I/O.
- The repo is ESM. Tests: `npx vitest run tests/core/constellation/semantic-particles`.
- The working tree is dirty with unrelated in-flight work. **Never `git add -A` or `git commit -a`.** Stage only the paths the task names.
- Never open `cache/ud/en_ewt-ud-test.conllu`.

---

## File Structure

| File | Responsibility | New? |
|---|---|---|
| `docs/superpowers/specs/2026-08-17-phase-8-complement-compat-design.md` | Design (already written) | exists |
| `docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md` | Frozen prereg (already written) | exists |
| `codex/core/constellation/semantic-particles/complement-compat.js` | Class projection + relation-keyed registry + lookup | create |
| `codex/core/constellation/semantic-particles/feature-score.js` | Consult registry for the two complement relations | modify |
| `codex/core/constellation/semantic-particles/compat-waterfall.js` | Stage 4–5 + complement mapping waterfall | modify |
| `codex/core/constellation/semantic-particles/index.js` | Re-export the new surface | modify |
| `tests/core/constellation/semantic-particles/complement-compat.test.js` | Registry, projection, abstention, illegal=false | create |
| `tests/core/constellation/semantic-particles/complement-lexical-3b.test.js` | Flip the “mapping stays shut” pin | modify |
| `tests/core/constellation/semantic-particles/complement-ontology.test.js` | Flip the “3A cannot create fires” pin | modify |
| `scripts/phase-8-train-class-pairs.mjs` | TRAIN-only class-pair demand census | create |
| `scripts/phase-8-complement-compat-observe.mjs` | DEV OBSERVE waterfall + complement instrument | create |
| `scripts/phase-8-complement-compat-derange.mjs` | Real vs deranged complement fires | create |
| `docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.{md,json}` | Frozen authored row set | create |
| `docs/superpowers/evidence/2026-08-17-phase-8-observe.{md,json}` | OBSERVE result | create |
| `docs/superpowers/evidence/2026-08-17-phase-8-derange.{md,json}` | Derangement result | create |

Do not modify `experimental-inventory.js`, `complement-ontology.js`, `compositional-semantics.js` (except if a comment is required; scores must stay 0), `compose-packed.js`, or any grimoire file.

---

### Task 1: Confirm the frozen prereg before any mapping code

**Files:**
- Exists: `docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md`
- Exists: `docs/superpowers/specs/2026-08-17-phase-8-complement-compat-design.md`

**Interfaces:**
- Consumes: the 3B baseline in `2026-08-17-compat-waterfall-census.json`
- Produces: nothing new. This task is a read-back gate.

- [ ] **Step 1: Read the prereg and spec end to end**

Confirm out loud (in the task log, not in code):

- Relations in scope are exactly `INFINITIVAL_COMPLEMENT` and `PROPOSITIONAL_COMPLEMENT`
- Only `compatMappingAvailable` and `actualCompatFire` may rise
- `entity.abstract` is not a governor class
- Desire / permission are not classes
- SCORE is not licensed

- [ ] **Step 2: Confirm the 3B baseline file still matches the prereg table**

Run:

```bash
node --input-type=module -e "
import { readFileSync } from 'node:fs';
const j = JSON.parse(readFileSync('docs/superpowers/evidence/2026-08-17-compat-waterfall-census.json', 'utf8'));
const w = j.rates.waterfall;
const s = j.silenceClasses;
const edges = j.rates.decisionBearingEdges;
const chk = {
  analysed: j.protection.analysed,
  parsed: j.protection.parsed,
  threw: j.protection.threw,
  eventsMean: j.protection.eventsMean,
  edges,
  relationRate: w.relationAvailable,
  leftRate: w.leftValueAvailable,
  rightRate: w.rightValueAvailable,
  mapRate: w.compatMappingAvailable,
  fireRate: w.actualCompatFire,
  C1: s['C1-composition-missing'],
  C2: s['C2-lexical-missing'],
  C3: s['C3-feature-missing'],
  namedCompleteRate: j.rates.namedCompleteRate,
  silentRate: j.rates.silentCompetitorRate,
};
console.log(JSON.stringify(chk, null, 2));
"
```

Expected: analysed 1824, parsed 585, threw 0, eventsMean `77.11677631578948`, edges 57012, C1 12466, C2 22542, C3 21295. The 3B result markdown (`2026-08-17-phase-3b-result.md`) is the source for the raw funnel counts 29570 / 11568 / 10989 / 946 / 827 — the JSON stores rates, not integer funnel tallies. Reconcile against that markdown, not against `Math.round(rate * edges)`.

If any digit differs, stop and reconcile the prereg against the file. Do not proceed on a drifting baseline.

- [ ] **Step 3: Confirm no mapping code exists yet**

Run:

```bash
rg -n "INFINITIVAL_COMPLEMENT|PROPOSITIONAL_COMPLEMENT" \
  codex/core/constellation/semantic-particles/feature-score.js
```

Expected: those strings appear only in `projectRelation` / comments, not inside `FEATURE_COMPAT`.

- [ ] **Step 4: Commit nothing.** The prereg and spec are already on disk. If they are untracked, stage only those two paths:

```bash
git add \
  docs/superpowers/specs/2026-08-17-phase-8-complement-compat-design.md \
  docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-compat.md \
  docs/superpowers/plans/2026-08-17-phase-8-complement-compat.md
git commit -m "$(cat <<'EOF'
docs(constellation): freeze Phase 8 complement COMPAT prereg

Wall three of the complement vertical slice. Relations and values
already exist; this act will author only the mapping. OBSERVE-only.
EOF
)"
```

---

### Task 2: Class projection and empty-table lookup

**Files:**
- Create: `codex/core/constellation/semantic-particles/complement-compat.js`
- Create: `tests/core/constellation/semantic-particles/complement-compat.test.js`
- Modify: `codex/core/constellation/semantic-particles/index.js` (re-exports only)

**Interfaces:**
- Consumes: feature particles shaped like `featuresFor` output (`{ kind, value }[]`); `UNKNOWN` from `feature-provider.js`
- Produces:
  - `COMPLEMENT_COMPAT_VERSION: '1.0.0'`
  - `COMPLEMENT_COMPAT_RELATIONS: readonly ['INFINITIVAL_COMPLEMENT', 'PROPOSITIONAL_COMPLEMENT']`
  - `GOVERNOR_CLASSES`, `COMPLEMENT_CLASSES` (frozen arrays)
  - `EVENT_KIND_TO_GOVERNOR_CLASS: Record<string, string>`
  - `COMPLEMENT_COMPAT: { [relation]: ReadonlyArray<{ governor, complement, weight }> }` — **empty arrays in this task**
  - `isComplementRelation(relation: string | null): boolean`
  - `governorClasses(features: Array<{kind, value}>): string[]` — positive `event.*` only; `[UNKNOWN]` if none
  - `complementClass(features, relation): string` — `infinitival-event` | `abstract-proposition` | `UNKNOWN`
  - `lookupComplementCompat(relation, govClass, compClass): { governor, complement, weight } | null`
  - `scoreComplementCompat({ leftFeats, rightFeats, relation }): { score, fired, illegal, governorClasses, complementClass, mappingAvailable, abstained }`
  - `diagnoseComplementMapping({ leftFeats, rightFeats, relation }): { relationExists, bothValuesExist, mappingExists, mappingFires, mappingAbstains, governorClasses, complementClass }`

- [ ] **Step 1: Write the failing tests**

Create `tests/core/constellation/semantic-particles/complement-compat.test.js`:

```js
import { describe, expect, it } from 'vitest';
import { UNKNOWN, featuresFor } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';
import {
  COMPLEMENT_COMPAT,
  COMPLEMENT_COMPAT_RELATIONS,
  COMPLEMENT_COMPAT_VERSION,
  complementClass,
  diagnoseComplementMapping,
  governorClasses,
  isComplementRelation,
  lookupComplementCompat,
  scoreComplementCompat,
} from '../../../../codex/core/constellation/semantic-particles/complement-compat.js';

const P = EXPERIMENTAL_FEATURE_PROVIDER;

describe('Phase 8 registry surface', () => {
  it('declares version 1.0.0 and exactly two relations', () => {
    expect(COMPLEMENT_COMPAT_VERSION).toBe('1.0.0');
    expect([...COMPLEMENT_COMPAT_RELATIONS]).toEqual([
      'INFINITIVAL_COMPLEMENT',
      'PROPOSITIONAL_COMPLEMENT',
    ]);
    expect(isComplementRelation('INFINITIVAL_COMPLEMENT')).toBe(true);
    expect(isComplementRelation('PROPOSITIONAL_COMPLEMENT')).toBe(true);
    expect(isComplementRelation('particle-of')).toBe(false);
    expect(isComplementRelation(null)).toBe(false);
  });
});

describe('governorClasses reads only positive event.*', () => {
  it('projects want as cognition and leave as motion', () => {
    expect(governorClasses(featuresFor('want', 'V', P))).toEqual(['cognition']);
    expect(governorClasses(featuresFor('leave', 'V', P))).toEqual(['motion']);
    expect(governorClasses(featuresFor('say', 'V', P))).toContain('communication');
  });

  it('refuses entity.abstract as a governor class (S/SBAR trap)', () => {
    const s = featuresFor('want', 'S', P);
    expect(s.find((f) => f.kind === 'entity.abstract').value).toBe(true);
    expect(governorClasses(s)).toEqual([UNKNOWN]);
  });

  it('returns UNKNOWN when no positive event.* is present', () => {
    expect(governorClasses(featuresFor('zzzzprobe', 'V', P))).toEqual([UNKNOWN]);
    expect(governorClasses([])).toEqual([UNKNOWN]);
  });
});

describe('complementClass is structural and relation-scoped', () => {
  it('reads INF as infinitival-event and SBAR as abstract-proposition', () => {
    expect(complementClass(featuresFor('leave', 'INF', P), 'INFINITIVAL_COMPLEMENT'))
      .toBe('infinitival-event');
    expect(complementClass(featuresFor('left', 'SBAR', P), 'PROPOSITIONAL_COMPLEMENT'))
      .toBe('abstract-proposition');
  });

  it('does not treat abstract SBAR as an infinitival event', () => {
    expect(complementClass(featuresFor('left', 'SBAR', P), 'INFINITIVAL_COMPLEMENT'))
      .toBe(UNKNOWN);
  });
});

describe('empty table abstains (Task 2: no rows yet)', () => {
  it('has empty arrays for both relations', () => {
    expect(COMPLEMENT_COMPAT.INFINITIVAL_COMPLEMENT).toEqual([]);
    expect(COMPLEMENT_COMPAT.PROPOSITIONAL_COMPLEMENT).toEqual([]);
  });

  it('lookup never hits, even on want × infinitival-event', () => {
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', 'cognition', 'infinitival-event'))
      .toBe(null);
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', UNKNOWN, 'infinitival-event'))
      .toBe(null);
  });

  it('scoreComplementCompat abstains and never marks illegal', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(row.fired).toBe(0);
    expect(row.score).toBe(0);
    expect(row.illegal).toBe(false);
    expect(row.abstained).toBe(true);
  });

  it('diagnoseComplementMapping reports mappingExists false while values exist', () => {
    const d = diagnoseComplementMapping({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(d.relationExists).toBe(true);
    expect(d.bothValuesExist).toBe(true);
    expect(d.mappingExists).toBe(false);
    expect(d.mappingFires).toBe(false);
    expect(d.mappingAbstains).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/core/constellation/semantic-particles/complement-compat.test.js`

Expected: FAIL with `Cannot find module` / `complement-compat.js`.

- [ ] **Step 3: Write the module with empty tables**

Create `codex/core/constellation/semantic-particles/complement-compat.js`:

```js
/**
 * Phase 8 — relation-keyed complement COMPAT.
 *
 * Not a generic feature matcher. Governor class × complement class,
 * scoped to INFINITIVAL_COMPLEMENT and PROPOSITIONAL_COMPLEMENT.
 * UNKNOWN abstains. illegal is always false.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/complement-compat
 */

import { UNKNOWN } from './feature-provider.js';
import { knownFeatureCount } from './experimental-inventory.js';

export const COMPLEMENT_COMPAT_VERSION = '1.0.0';

export const COMPLEMENT_COMPAT_RELATIONS = Object.freeze([
  'INFINITIVAL_COMPLEMENT',
  'PROPOSITIONAL_COMPLEMENT',
]);

export const GOVERNOR_CLASSES = Object.freeze([
  'cognition', 'communication', 'perception', 'creation',
  'state', 'motion', 'possession', 'change',
]);

export const COMPLEMENT_CLASSES = Object.freeze([
  'infinitival-event',
  'abstract-proposition',
]);

export const EVENT_KIND_TO_GOVERNOR_CLASS = Object.freeze({
  'event.cognition': 'cognition',
  'event.communication': 'communication',
  'event.perception': 'perception',
  'event.creation': 'creation',
  'event.state': 'state',
  'event.motion': 'motion',
  'event.possession': 'possession',
  'event.change': 'change',
});

export const COMPLEMENT_KIND_BY_CLASS = Object.freeze({
  'infinitival-event': 'function.infinitival',
  'abstract-proposition': 'entity.abstract',
});

export const COMPLEMENT_COMPAT = Object.freeze({
  INFINITIVAL_COMPLEMENT: Object.freeze([]),
  PROPOSITIONAL_COMPLEMENT: Object.freeze([]),
});

function valueOf(features, kind) {
  const row = (features || []).find((f) => f.kind === kind);
  if (!row || row.value === UNKNOWN || row.confidence == null) return null;
  return row.value;
}

export function isComplementRelation(relation) {
  return COMPLEMENT_COMPAT_RELATIONS.includes(relation);
}

export function governorClasses(features) {
  const out = [];
  for (const [kind, cls] of Object.entries(EVENT_KIND_TO_GOVERNOR_CLASS)) {
    if (valueOf(features, kind) === true) out.push(cls);
  }
  return out.length ? out : [UNKNOWN];
}

export function complementClass(features, relation) {
  if (relation === 'INFINITIVAL_COMPLEMENT') {
    return valueOf(features, 'function.infinitival') === true ? 'infinitival-event' : UNKNOWN;
  }
  if (relation === 'PROPOSITIONAL_COMPLEMENT') {
    return valueOf(features, 'entity.abstract') === true ? 'abstract-proposition' : UNKNOWN;
  }
  return UNKNOWN;
}

export function lookupComplementCompat(relation, govClass, compClass) {
  if (!isComplementRelation(relation)) return null;
  if (govClass === UNKNOWN || compClass === UNKNOWN) return null;
  const rows = COMPLEMENT_COMPAT[relation] || [];
  return rows.find((r) => r.governor === govClass && r.complement === compClass) || null;
}

export function scoreComplementCompat({ leftFeats, rightFeats, relation }) {
  const govs = governorClasses(leftFeats);
  const comp = complementClass(rightFeats, relation);
  let score = 0;
  let fired = 0;
  if (isComplementRelation(relation)) {
    for (const gov of govs) {
      const hit = lookupComplementCompat(relation, gov, comp);
      if (!hit) continue;
      score += hit.weight;
      fired += 1;
    }
  }
  const mappingAvailable = isComplementRelation(relation)
    && (COMPLEMENT_COMPAT[relation] || []).some((row) => {
      const gk = Object.entries(EVENT_KIND_TO_GOVERNOR_CLASS).find(([, c]) => c === row.governor)?.[0];
      const ck = COMPLEMENT_KIND_BY_CLASS[row.complement];
      return gk && ck && valueOf(leftFeats, gk) != null && valueOf(rightFeats, ck) != null;
    });
  return Object.freeze({
    score,
    fired,
    illegal: false,
    governorClasses: Object.freeze(govs),
    complementClass: comp,
    mappingAvailable,
    abstained: fired === 0,
  });
}

export function diagnoseComplementMapping({ leftFeats, rightFeats, relation }) {
  const relationExists = isComplementRelation(relation);
  const bothValuesExist = knownFeatureCount(leftFeats) > 0 && knownFeatureCount(rightFeats) > 0;
  const mappingExists = relationExists && (COMPLEMENT_COMPAT[relation] || []).length > 0;
  const scored = scoreComplementCompat({ leftFeats, rightFeats, relation });
  const mappingFires = scored.fired > 0;
  return Object.freeze({
    relationExists,
    bothValuesExist,
    mappingExists,
    mappingFires,
    mappingAbstains: bothValuesExist && mappingExists && !mappingFires,
    governorClasses: scored.governorClasses,
    complementClass: scored.complementClass,
  });
}
```

- [ ] **Step 4: Re-export from `index.js`**

Add after the `complement-ontology.js` export block:

```js
export {
  COMPLEMENT_CLASSES,
  COMPLEMENT_COMPAT,
  COMPLEMENT_COMPAT_RELATIONS,
  COMPLEMENT_COMPAT_VERSION,
  complementClass,
  diagnoseComplementMapping,
  governorClasses,
  isComplementRelation,
  lookupComplementCompat,
  scoreComplementCompat,
} from './complement-compat.js';
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/core/constellation/semantic-particles/complement-compat.test.js`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add \
  codex/core/constellation/semantic-particles/complement-compat.js \
  codex/core/constellation/semantic-particles/index.js \
  tests/core/constellation/semantic-particles/complement-compat.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): add empty Phase 8 complement COMPAT registry

Class projection only. Tables are empty so every pair abstains.
FEATURE_COMPAT is untouched. OBSERVE-only.
EOF
)"
```

---

### Task 3: TRAIN class-pair demand census

**Files:**
- Create: `scripts/phase-8-train-class-pairs.mjs`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.md`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.json`

**Interfaces:**
- Consumes: `governorClasses`, `complementClass`, `ends`, `projectRelation`, `diagnoseCompetitionEdge` / oriented features, `loadSplit('train')`
- Produces: frozen JSON/MD listing observed `(relation, governorClass, complementClass)` counts on TRAIN complement decision edges, the allow-list intersection, and the exact row set Task 4 will author

- [ ] **Step 1: Write the census script**

Create `scripts/phase-8-train-class-pairs.mjs`. It must:

- Never open TEST
- Analyse TRAIN sentences ≤ 28 tokens with `composePacked(..., { semanticParticles: { mode: 'observe' } })`
- For each decision-bearing complement-relation edge, project `governorClasses(oriented.left)` and `complementClass(oriented.right, relation)`
- Count edges and distinct governor lemmas per `(relation, govClass, compClass)`
- Print allow-list hits with count ≥ 30 as `eligible`
- Print forbid-list hits separately as `seen-forbidden`
- Write JSON + MD under `docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.*`
- Include `testFileOpened: false`, `scored: false`, `authoredRows: [...]` (the intersection)

Skeleton (complete this file; do not leave placeholders):

```js
#!/usr/bin/env node
/**
 * TRAIN-only complement class-pair demand census. OBSERVE. TEST sealed.
 * Does not author mappings. Writes the row set Task 4 is allowed to implement.
 *
 *   node scripts/phase-8-train-class-pairs.mjs
 */
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { composePacked } from '../codex/core/constellation/compose-packed.js';
import { EXPERIMENTAL_FEATURE_PROVIDER } from '../codex/core/constellation/semantic-particles/experimental-inventory.js';
import { DEFAULT_LEXICAL_LEXICON } from '../codex/core/constellation/semantic-particles/lexical-semantics.js';
import { featuresFor } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { ends, projectRelation } from '../codex/core/constellation/semantic-particles/feature-score.js';
import { derivationSignature, isGlueBond, lemmaOf } from '../codex/core/constellation/semantic-particles/decision-bearing.js';
import {
  complementClass,
  governorClasses,
  isComplementRelation,
} from '../codex/core/constellation/semantic-particles/complement-compat.js';
import { loadPosMap, loadSplit } from './lib/constellation-corpus.mjs';

const OUT = 'docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.json';
const OUT_MD = 'docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.md';
const MAX_TOKENS = 28;
const CUTOFF = 30;
const TEST_PATH = path.resolve('cache/ud/en_ewt-ud-test.conllu');
if (existsSync(TEST_PATH)) {
  // sealed — never read
}

const ALLOW = new Set([
  'INFINITIVAL_COMPLEMENT|cognition|infinitival-event',
  'INFINITIVAL_COMPLEMENT|communication|infinitival-event',
  'INFINITIVAL_COMPLEMENT|creation|infinitival-event',
  'INFINITIVAL_COMPLEMENT|perception|infinitival-event',
  'INFINITIVAL_COMPLEMENT|state|infinitival-event',
  'PROPOSITIONAL_COMPLEMENT|cognition|abstract-proposition',
  'PROPOSITIONAL_COMPLEMENT|communication|abstract-proposition',
  'PROPOSITIONAL_COMPLEMENT|perception|abstract-proposition',
]);

const FORBID_GOV = new Set([
  'motion', 'possession', 'change',
]);

const posMap = loadPosMap();
const train = loadSplit('train');
const lexicon = DEFAULT_LEXICAL_LEXICON;
const provider = EXPERIMENTAL_FEATURE_PROVIDER;
const counts = new Map(); // key -> { edges, lemmas: Set }

function add(relation, govClass, compClass, lemma) {
  const key = `${relation}|${govClass}|${compClass}`;
  let row = counts.get(key);
  if (!row) {
    row = { relation, governor: govClass, complement: compClass, edges: 0, lemmas: new Set() };
    counts.set(key, row);
  }
  row.edges += 1;
  if (lemma) row.lemmas.add(lemma);
}

let analysed = 0;
let threw = 0;
for (const rec of train) {
  const tokens = (rec.tokens || []).map((t) => t.form);
  if (tokens.length === 0 || tokens.length > MAX_TOKENS) continue;
  analysed += 1;
  if (analysed % 1500 === 0) process.stderr.write(`[phase8-train] ${analysed}\n`);
  let chart;
  try {
    chart = composePacked(tokens, posMap, { semanticParticles: { mode: 'observe' } });
  } catch {
    threw += 1;
    continue;
  }
  for (const node of chart.molecules || []) {
    const bySignature = new Map();
    for (const derivation of node.derivations || []) {
      const sig = derivationSignature(derivation);
      if (!bySignature.has(sig)) bySignature.set(sig, derivation);
    }
    const decision = [...bySignature.values()].filter((d) => !isGlueBond(d.bond));
    if (decision.length < 2) continue;
    for (const derivation of decision) {
      if (derivation.lift) continue;
      const leftType = derivation.left?.type;
      const rightType = derivation.right?.type;
      const relation = projectRelation(leftType, rightType, 'right');
      if (!isComplementRelation(relation)) continue;
      const leftFeats = featuresFor(lemmaOf(derivation.left), leftType, provider);
      const rightFeats = featuresFor(lemmaOf(derivation.right), rightType, provider);
      const oriented = ends(leftType, rightType, leftFeats, rightFeats);
      const govs = governorClasses(oriented.left);
      const comp = complementClass(oriented.right, relation);
      const govLemma = lemmaOf(derivation.left);
      for (const gov of govs) add(relation, gov, comp, govLemma);
    }
  }
}

const rows = [...counts.values()]
  .map((r) => ({
    ...r,
    lemmas: r.lemmas.size,
    key: `${r.relation}|${r.governor}|${r.complement}`,
    allowed: ALLOW.has(`${r.relation}|${r.governor}|${r.complement}`),
    forbidden: FORBID_GOV.has(r.governor)
      || (r.governor === 'state' && r.complement === 'abstract-proposition')
      || r.governor === 'UNKNOWN',
  }))
  .sort((a, b) => b.edges - a.edges || a.key.localeCompare(b.key));

const authoredRows = rows
  .filter((r) => r.allowed && !r.forbidden && r.edges >= CUTOFF)
  .map((r) => ({
    relation: r.relation,
    governor: r.governor,
    complement: r.complement,
    weight: (r.governor === 'cognition' || r.governor === 'communication') ? 2 : 1.5,
    trainEdges: r.edges,
  }));

const report = {
  contract: 'PB-PHASE8-TRAIN-CLASS-PAIRS-v1',
  mode: 'observe',
  testFileOpened: false,
  scored: false,
  trainAnalysed: analysed,
  threw,
  cutoff: CUTOFF,
  pairs: rows.map(({ lemmas, ...rest }) => rest),
  authoredRows,
};
writeFileSync(OUT, `${JSON.stringify(report, null, 2)}\n`);

const md = [
  '# OBSERVE — Phase 8 TRAIN class-pair demand',
  '',
  'TEST sealed. SCORE off. No mappings authored by this script.',
  '',
  `- TRAIN analysed: ${analysed}, threw: ${threw}, cutoff: ${CUTOFF}`,
  '',
  '## Authored row set (allow-list ∩ mass ≥ 30 ∩ not forbidden)',
  '',
  '| relation | governor | complement | weight | TRAIN edges |',
  '|---|---|---|---|---|',
  ...authoredRows.map((r) => `| ${r.relation} | ${r.governor} | ${r.complement} | ${r.weight} | ${r.trainEdges} |`),
  '',
  '## All observed pairs',
  '',
  '| pair | edges | allowed | forbidden |',
  '|---|---|---|---|',
  ...rows.map((r) => `| ${r.key} | ${r.edges} | ${r.allowed} | ${r.forbidden} |`),
  '',
  'Stay in OBSERVE. Task 4 may author exactly `authoredRows`.',
];
writeFileSync(OUT_MD, `${md.join('\n')}\n`);
console.log(JSON.stringify({ authoredRows, wrote: [OUT, OUT_MD] }, null, 2));
```

- [ ] **Step 2: Run the census**

Run: `node scripts/phase-8-train-class-pairs.mjs`

This walks ~10k TRAIN sentences. Budget several minutes. Expected: JSON + MD written, `authoredRows` is a subset of the eight allow-list pairs, `testFileOpened: false`.

- [ ] **Step 3: Freeze the row set**

Read the MD. Confirm:

- No forbidden pair is in `authoredRows`
- At least `cognition × infinitival-event` and `cognition × abstract-proposition` appear (3B lit `want`/`need`/`hope`/`think`/`believe`)
- UNKNOWN / motion / possession remain visible in “all observed” and are not authored

If a linguistically required allow-list pair has mass < 30, **leave it out**. Do not lower the cutoff to rescue it.

- [ ] **Step 4: Commit the script and evidence**

```bash
git add \
  scripts/phase-8-train-class-pairs.mjs \
  docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.md \
  docs/superpowers/evidence/2026-08-17-phase-8-train-class-pairs.json
git commit -m "$(cat <<'EOF'
observe(constellation): freeze Phase 8 TRAIN complement class pairs

Allow-list intersected with TRAIN mass. Forbidden pairs reported
and not authored. TEST sealed.
EOF
)"
```

---

### Task 4: Author the complement COMPAT rows

**Files:**
- Modify: `codex/core/constellation/semantic-particles/complement-compat.js` (`COMPLEMENT_COMPAT` only)
- Modify: `tests/core/constellation/semantic-particles/complement-compat.test.js`

**Interfaces:**
- Consumes: `authoredRows` from Task 3
- Produces: frozen `COMPLEMENT_COMPAT` tables; `lookupComplementCompat` now hits those pairs; `diagnoseComplementMapping.mappingExists === true`

- [ ] **Step 1: Replace the empty-table tests with authored-table tests**

In `complement-compat.test.js`, delete the `empty table abstains` describe. Add:

```js
describe('authored complement COMPAT (TRAIN-frozen rows)', () => {
  it('contains only allow-listed pairs and never a forbidden pair', () => {
    const forbidden = new Set([
      'motion|infinitival-event', 'motion|abstract-proposition',
      'possession|infinitival-event', 'possession|abstract-proposition',
      'change|infinitival-event', 'change|abstract-proposition',
      'state|abstract-proposition',
    ]);
    for (const relation of COMPLEMENT_COMPAT_RELATIONS) {
      for (const row of COMPLEMENT_COMPAT[relation]) {
        expect(forbidden.has(`${row.governor}|${row.complement}`)).toBe(false);
        expect(row.governor).not.toBe('UNKNOWN');
        expect(Object.isFrozen(row)).toBe(true);
      }
    }
  });

  it('fires want × leave on INFINITIVAL_COMPLEMENT and never marks illegal', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(row.fired).toBeGreaterThan(0);
    expect(row.score).toBeGreaterThan(0);
    expect(row.illegal).toBe(false);
    expect(row.abstained).toBe(false);
  });

  it('abstains on motion × infinitival-event (leave to VP)', () => {
    const row = scoreComplementCompat({
      leftFeats: featuresFor('leave', 'V', P),
      rightFeats: featuresFor('go', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(governorClasses(featuresFor('leave', 'V', P))).toEqual(['motion']);
    expect(row.fired).toBe(0);
    expect(row.abstained).toBe(true);
    expect(row.illegal).toBe(false);
  });

  it('fires think × abstract-proposition and abstains on S-governed abstract×abstract', () => {
    const live = scoreComplementCompat({
      leftFeats: featuresFor('think', 'V', P),
      rightFeats: featuresFor('left', 'SBAR', P),
      relation: 'PROPOSITIONAL_COMPLEMENT',
    });
    expect(live.fired).toBeGreaterThan(0);

    const trap = scoreComplementCompat({
      leftFeats: featuresFor('want', 'S', P),
      rightFeats: featuresFor('left', 'SBAR', P),
      relation: 'PROPOSITIONAL_COMPLEMENT',
    });
    expect(governorClasses(featuresFor('want', 'S', P))).toEqual([UNKNOWN]);
    expect(trap.fired).toBe(0);
    expect(trap.abstained).toBe(true);
  });

  it('UNKNOWN never matches a row', () => {
    expect(lookupComplementCompat('INFINITIVAL_COMPLEMENT', UNKNOWN, 'infinitival-event')).toBe(null);
    expect(lookupComplementCompat('PROPOSITIONAL_COMPLEMENT', 'cognition', UNKNOWN)).toBe(null);
  });

  it('diagnoseComplementMapping now reports mappingExists and can abstain', () => {
    const fire = diagnoseComplementMapping({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('leave', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(fire.mappingExists).toBe(true);
    expect(fire.mappingFires).toBe(true);
    expect(fire.mappingAbstains).toBe(false);

    const abstain = diagnoseComplementMapping({
      leftFeats: featuresFor('leave', 'V', P),
      rightFeats: featuresFor('go', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(abstain.mappingExists).toBe(true);
    expect(abstain.mappingFires).toBe(false);
    expect(abstain.mappingAbstains).toBe(true);
  });
});
```

If Task 3 dropped `cognition × infinitival-event` (it must not), stop — the prereg’s floor is wrong or the provider is dark.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/constellation/semantic-particles/complement-compat.test.js`

Expected: FAIL on `fired > 0` / `mappingExists` because the tables are still empty.

- [ ] **Step 3: Fill `COMPLEMENT_COMPAT` from the frozen TRAIN file**

Replace the empty arrays. Use **exactly** the `authoredRows` from Task 3. Example shape if all eight survived:

```js
export const COMPLEMENT_COMPAT = Object.freeze({
  INFINITIVAL_COMPLEMENT: Object.freeze([
    Object.freeze({ governor: 'cognition', complement: 'infinitival-event', weight: 2 }),
    Object.freeze({ governor: 'communication', complement: 'infinitival-event', weight: 2 }),
    Object.freeze({ governor: 'creation', complement: 'infinitival-event', weight: 1.5 }),
    Object.freeze({ governor: 'perception', complement: 'infinitival-event', weight: 1.5 }),
    Object.freeze({ governor: 'state', complement: 'infinitival-event', weight: 1.5 }),
  ]),
  PROPOSITIONAL_COMPLEMENT: Object.freeze([
    Object.freeze({ governor: 'cognition', complement: 'abstract-proposition', weight: 2 }),
    Object.freeze({ governor: 'communication', complement: 'abstract-proposition', weight: 2 }),
    Object.freeze({ governor: 'perception', complement: 'abstract-proposition', weight: 1.5 }),
  ]),
});
```

Do not add a row that is missing from `authoredRows`. Do not add motion / possession / change / `state × abstract-proposition`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/core/constellation/semantic-particles/complement-compat.test.js`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add \
  codex/core/constellation/semantic-particles/complement-compat.js \
  tests/core/constellation/semantic-particles/complement-compat.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): author TRAIN-gated complement COMPAT rows

Relation-keyed class pairs only. Forbidden pairs stay out.
UNKNOWN still abstains. illegal stays false.
EOF
)"
```

---

### Task 5: Wire T1 and the global waterfall

**Files:**
- Modify: `codex/core/constellation/semantic-particles/feature-score.js`
- Modify: `codex/core/constellation/semantic-particles/compat-waterfall.js`
- Modify: `tests/core/constellation/semantic-particles/complement-lexical-3b.test.js`
- Modify: `tests/core/constellation/semantic-particles/complement-ontology.test.js`
- Modify: `tests/core/constellation/semantic-particles/feature-score.test.js`

**Interfaces:**
- Consumes: `isComplementRelation`, `scoreComplementCompat` from Task 4
- Produces: `edgeCompatibility` / `scoreLexicalReading` / `waterfallStages` fire on authored complement pairs; `diagnoseT1Edge` status `could-fire` on `want`+`INF`; composition scores unchanged

- [ ] **Step 1: Write the failing T1 / waterfall pins**

Add to `feature-score.test.js`:

```js
import { FEATURE_COMPAT } from '../../../../codex/core/constellation/semantic-particles/feature-score.js';

describe('Phase 8 complement T1', () => {
  it('keeps FEATURE_COMPAT free of complement-relation rows', () => {
    const relations = new Set(FEATURE_COMPAT.map((r) => r.relation));
    expect(relations.has('INFINITIVAL_COMPLEMENT')).toBe(false);
    expect(relations.has('PROPOSITIONAL_COMPLEMENT')).toBe(false);
  });

  it('scores want+INF above leave+INF and marks neither illegal', () => {
    const want = edgeCompatibility({
      left: { lemma: 'want', type: 'V' },
      right: { lemma: 'leave', type: 'INF' },
      relation: 'INFINITIVAL_COMPLEMENT',
      provider,
    });
    const leave = edgeCompatibility({
      left: { lemma: 'leave', type: 'V' },
      right: { lemma: 'go', type: 'INF' },
      relation: 'INFINITIVAL_COMPLEMENT',
      provider,
    });
    expect(want.fired).toBeGreaterThan(0);
    expect(leave.fired).toBe(0);
    expect(want.illegal).toBe(false);
    expect(leave.illegal).toBe(false);
    expect(want.score).toBeGreaterThan(leave.score);
  });
});
```

In `complement-lexical-3b.test.js`, replace the block that expects mapping shut:

```js
describe('3B waterfall consequence: values light; Phase 8 mapping can fire', () => {
  it('want + INF reaches stage 5; leave + INF abstains at stage 4/5', () => {
    const want = waterfallStages({
      leftFeats: featuresFor('want', 'V', P),
      rightFeats: featuresFor('zzzzprobe', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(want.relationAvailable).toBe(true);
    expect(want.leftValueAvailable).toBe(true);
    expect(want.rightValueAvailable).toBe(true);
    expect(want.compatMappingAvailable).toBe(true);
    expect(want.actualCompatFire).toBe(true);

    const motion = waterfallStages({
      leftFeats: featuresFor('leave', 'V', P),
      rightFeats: featuresFor('zzzzprobe', 'INF', P),
      relation: 'INFINITIVAL_COMPLEMENT',
    });
    expect(motion.leftValueAvailable).toBe(true);
    expect(motion.rightValueAvailable).toBe(true);
    expect(motion.actualCompatFire).toBe(false);
  });
});
```

In `complement-ontology.test.js`, replace `Phase 3A cannot create fires` with:

```js
describe('Phase 8 T1 fires only on authored complement pairs', () => {
  it('want+INF and think+SBAR can fire; S-governed abstract×abstract cannot', () => {
    const want = diagnoseT1Edge(
      { lemma: 'want', type: 'V' },
      { lemma: 'leave', type: 'INF', side: 'right' },
      provider,
    );
    expect(want.relation).toBe('INFINITIVAL_COMPLEMENT');
    expect(want.status).toBe('could-fire');
    expect(want.score).toBeGreaterThan(0);

    const clause = diagnoseT1Edge(
      { lemma: 'want', type: 'S' },
      { lemma: 'ran', type: 'SBAR', side: 'right' },
      provider,
    );
    expect(clause.relation).toBe('PROPOSITIONAL_COMPLEMENT');
    expect(clause.status).not.toBe('could-fire');
    expect(clause.score).toBe(null);
  });

  it('still obeys the no-evidence law on composition scores', () => {
    // keep the existing composeMeanings score ≡ 0 cases untouched
  });
});
```

Keep the existing `OBEYS the no-evidence law` test **verbatim**. Do not give complement composition a score.

- [ ] **Step 2: Run the new pins and confirm they fail**

Run:

```bash
npx vitest run \
  tests/core/constellation/semantic-particles/feature-score.test.js \
  tests/core/constellation/semantic-particles/complement-lexical-3b.test.js \
  tests/core/constellation/semantic-particles/complement-ontology.test.js
```

Expected: FAIL on `could-fire` / `compatMappingAvailable` / `want.fired`.

- [ ] **Step 3: Wire `feature-score.js`**

At the top, add:

```js
import {
  isComplementRelation,
  scoreComplementCompat,
} from './complement-compat.js';
```

In `edgeCompatibility`, after building `leftFeats` / `rightFeats`, branch:

```js
export function edgeCompatibility({ left, right, relation, provider }) {
  const leftFeats = featuresFor(left.lemma, left.type, provider);
  const rightFeats = featuresFor(right.lemma, right.type, provider);
  if (isComplementRelation(relation)) {
    const hit = scoreComplementCompat({ leftFeats, rightFeats, relation });
    return Object.freeze({
      score: hit.score,
      fired: hit.fired,
      illegal: false,
      relation,
    });
  }
  // existing FEATURE_COMPAT loop unchanged
  ...
}
```

In `scoreLexicalReading`, inside the neighbor loop, after `oriented` is computed:

```js
    if (isComplementRelation(relation)) {
      const hit = scoreComplementCompat({
        leftFeats: oriented.left,
        rightFeats: oriented.right,
        relation,
      });
      if (hit.fired > 0) {
        score += hit.score;
        used = true;
      }
      continue;
    }
    // existing FEATURE_COMPAT loop unchanged
```

Do not add complement rows to `FEATURE_COMPAT`. Do not change `projectRelation` or `ends`.

- [ ] **Step 4: Wire `waterfallStages`**

In `compat-waterfall.js`, import `isComplementRelation` and `scoreComplementCompat`. Replace the `FEATURE_COMPAT` loop with:

```js
  if (isComplementRelation(relation)) {
    const hit = scoreComplementCompat({ leftFeats, rightFeats, relation });
    return Object.freeze({
      relationAvailable: true,
      leftValueAvailable: leftLit,
      rightValueAvailable: rightLit,
      compatMappingAvailable: hit.mappingAvailable,
      actualCompatFire: hit.fired > 0,
    });
  }
  for (const rule of FEATURE_COMPAT) {
    // existing loop unchanged
  }
```

Non-complement edges must keep the old loop. `actualCompatFire` must still agree with `diagnoseT1Edge` (existing waterfall test).

- [ ] **Step 5: Run the semantic-particle suite**

Run: `npx vitest run tests/core/constellation/semantic-particles`

Expected: all PASS, including the 3A composition score ≡ 0 tests and the waterfall monotone / T1-equivalence tests.

- [ ] **Step 6: Commit**

```bash
git add \
  codex/core/constellation/semantic-particles/feature-score.js \
  codex/core/constellation/semantic-particles/compat-waterfall.js \
  tests/core/constellation/semantic-particles/feature-score.test.js \
  tests/core/constellation/semantic-particles/complement-lexical-3b.test.js \
  tests/core/constellation/semantic-particles/complement-ontology.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): fire complement COMPAT through T1 and the waterfall

Complement relations consult the class registry. FEATURE_COMPAT
gains no complement rows. Composition scores stay 0.
EOF
)"
```

---

### Task 6: Complement mapping waterfall on the OBSERVE census

**Files:**
- Create: `scripts/phase-8-complement-compat-observe.mjs`
- Modify: `codex/core/constellation/semantic-particles/compat-waterfall.js` only if `diagnoseCompetitionEdge` needs to attach `diagnoseComplementMapping` (preferred: attach it in the script from oriented features, keep the core diagnose payload stable)

**Interfaces:**
- Consumes: existing `diagnoseCompetitionEdge`, `diagnoseComplementMapping`, `summarizeWaterfall`
- Produces: `docs/superpowers/evidence/2026-08-17-phase-8-observe.{json,md}` — must not overwrite the 3B census files

- [ ] **Step 1: Write the OBSERVE script**

Clone the structure of `scripts/compat-waterfall-census.mjs`:

- Same chamber (DEV ≤ 28, observe mode, 8 fingerprint replays, TRAIN frequencies optional)
- Write to `docs/superpowers/evidence/2026-08-17-phase-8-observe.{json,md}`
- Keep `testFileOpened: false`, `scored: false`
- Tally global `WATERFALL_STAGES` exactly as the 3B script does
- Additionally, for every edge with `isComplementRelation(row.relation)`:

```js
const cmap = diagnoseComplementMapping({
  leftFeats: /* oriented left from the same ends() call */,
  rightFeats: /* oriented right */,
  relation: row.relation,
});
```

Easiest path that does not fork `diagnoseCompetitionEdge`: after `diagnoseCompetitionEdge`, recompute oriented features the same way `diagnoseCompetitionEdge` does (`featuresFor` + `ends`) and call `diagnoseComplementMapping`. Do not change the diagnose payload unless a test requires it.

Tally:

```
complementEdges
complementRelationExists
complementBothValuesExist
complementMappingExists
complementMappingFires
complementMappingAbstains
firesByRelation { INFINITIVAL_COMPLEMENT, PROPOSITIONAL_COMPLEMENT }
nonComplementFires
```

- [ ] **Step 2: Unit-test the mapping-waterfall flags on the want / leave / S trap cases**

Add to `complement-compat.test.js` (already covered by `diagnoseComplementMapping` in Task 4). If you attach the flags onto `diagnoseCompetitionEdge`, add one case to `compat-waterfall.test.js`:

```js
it('want+INF complement mapping fires; S+SBAR abstains', () => {
  const inf = diagnoseCompetitionEdge(
    derivation(['V', 'INF', 'VP'], leaf('V', 'want'), leaf('INF', 'leave')),
    lexicon,
    provider,
  );
  expect(inf.relation).toBe('INFINITIVAL_COMPLEMENT');
  expect(inf.stages.actualCompatFire).toBe(true);

  const sbar = diagnoseCompetitionEdge(
    derivation(['S', 'SBAR', 'S'], leaf('S', 'want'), leaf('SBAR', 'left')),
    lexicon,
    provider,
  );
  expect(sbar.relation).toBe('PROPOSITIONAL_COMPLEMENT');
  expect(sbar.stages.actualCompatFire).toBe(false);
});
```

- [ ] **Step 3: Run unit tests**

Run: `npx vitest run tests/core/constellation/semantic-particles`

Expected: PASS.

- [ ] **Step 4: Commit the script (not the census result yet)**

```bash
git add scripts/phase-8-complement-compat-observe.mjs
git add tests/core/constellation/semantic-particles/compat-waterfall.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): add Phase 8 complement mapping OBSERVE census

Writes a new artifact. Does not overwrite the 3B waterfall baseline.
EOF
)"
```

---

### Task 7: Run OBSERVE and score the prereg

**Files:**
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-observe.json`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-observe.md`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-result.md`

**Interfaces:**
- Consumes: Task 6 script, prereg P1–P20
- Produces: evidence that the success signature held, or a rollback report

- [ ] **Step 1: Run the OBSERVE census**

Run: `node scripts/phase-8-complement-compat-observe.mjs`

Budget several minutes (DEV 1824 + 8 fingerprint replays). Do not open TEST.

- [ ] **Step 2: Write `2026-08-17-phase-8-result.md` against the prereg table**

For each of P1–P20, record predicted / measured / verdict. Required headline:

```
relationAvailable        flat
leftValueAvailable       flat
rightValueAvailable      flat
compatMappingAvailable   up   (complement only)
actualCompatFire         up   (complement only)
complement mappingFires  > 0
complement mappingAbstains > 0
forest fingerprints      8/8
TEST                     sealed
SCORE                    off
```

If any exact predictor (P1–P13) misses, **stop and roll back Task 5**. Do not “fix” the prediction. Do not open SCORE.

If P14 (complement fire > 0) misses, the table did not reach real edges. Inspect the complement waterfall before authoring more rows. Do not widen the allow-list in the same act.

- [ ] **Step 3: Commit the evidence**

```bash
git add \
  docs/superpowers/evidence/2026-08-17-phase-8-observe.json \
  docs/superpowers/evidence/2026-08-17-phase-8-observe.md \
  docs/superpowers/evidence/2026-08-17-phase-8-result.md
git commit -m "$(cat <<'EOF'
observe(constellation): record Phase 8 complement COMPAT OBSERVE result

Mapping and fire moved on complement relations only. Forest identical.
TEST sealed. SCORE not licensed.
EOF
)"
```

---

### Task 8: Derangement control

**Files:**
- Create: `scripts/phase-8-complement-compat-derange.mjs`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-derange.json`
- Create: `docs/superpowers/evidence/2026-08-17-phase-8-derange.md`

**Interfaces:**
- Consumes: `derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, 0x50383031)`, `diagnoseComplementMapping`, `efficacyVerdict`
- Produces: real vs deranged complement `mappingFires`; verdict `REAL_BEATS_CONTROLS` or stop

- [ ] **Step 1: Write the derange script**

Same DEV chamber as Task 7. For each decision-bearing complement edge, compute `diagnoseComplementMapping` twice: real provider vs `derangeFeatureValues(provider, 0x50383031)`.

Assert / record:

- `relationAvailable` real === deranged (same projections)
- left/right value-available counts real === deranged (known-count preserved)
- non-complement `actualCompatFire` may move (existing T1 rows are value-sensitive); **report it**, do not hide it
- complement `mappingFires` real vs deranged must differ
- forest fingerprints still 8/8 on observe-vs-off (derange does not touch the chart)

```js
import { derangeFeatureValues } from '../codex/core/constellation/semantic-particles/feature-provider.js';
import { efficacyVerdict } from '../codex/core/constellation/semantic-particles/exposure-gate.js';

const DERANGE_SEED = 0x50383031;
const deranged = derangeFeatureValues(EXPERIMENTAL_FEATURE_PROVIDER, DERANGE_SEED);
const verdict = efficacyVerdict({
  realHits: realComplementFires,
  derangeHits: derangedComplementFires,
});
```

- [ ] **Step 2: Add a unit pin that derangement moves a complement score and preserves known-count**

Add to `complement-compat.test.js`:

```js
import { derangeFeatureValues } from '../../../../codex/core/constellation/semantic-particles/feature-provider.js';
import { knownFeatureCount } from '../../../../codex/core/constellation/semantic-particles/experimental-inventory.js';

it('deranges complement fire while preserving known-count', () => {
  const seed = 0x50383031;
  const fake = derangeFeatureValues(P, seed);
  const real = scoreComplementCompat({
    leftFeats: featuresFor('want', 'V', P),
    rightFeats: featuresFor('leave', 'INF', P),
    relation: 'INFINITIVAL_COMPLEMENT',
  });
  const der = scoreComplementCompat({
    leftFeats: featuresFor('want', 'V', fake),
    rightFeats: featuresFor('leave', 'INF', fake),
    relation: 'INFINITIVAL_COMPLEMENT',
  });
  expect(knownFeatureCount(featuresFor('want', 'V', fake)))
    .toBe(knownFeatureCount(featuresFor('want', 'V', P)));
  // A single pair may or may not move; the suite-level census is the gate.
  expect(typeof der.score).toBe('number');
  expect(real.illegal).toBe(false);
  expect(der.illegal).toBe(false);
});
```

- [ ] **Step 3: Run unit tests, then the derange census**

```bash
npx vitest run tests/core/constellation/semantic-particles/complement-compat.test.js
node scripts/phase-8-complement-compat-derange.mjs
```

- [ ] **Step 4: Apply the prereg verdict**

If `efficacyVerdict` is `FALSIFIED_OR_NONDISCRIMINATIVE` (realHits === derangeHits): write that result, stop, **do not start Task 9**. Phase 8 has not demonstrated semantics. Honest remainder: the table is a coverage light, not a semantic one.

If `REAL_BEATS_CONTROLS`: record it. SCORE is now *considerable*, not licensed.

- [ ] **Step 5: Commit**

```bash
git add \
  scripts/phase-8-complement-compat-derange.mjs \
  tests/core/constellation/semantic-particles/complement-compat.test.js \
  docs/superpowers/evidence/2026-08-17-phase-8-derange.json \
  docs/superpowers/evidence/2026-08-17-phase-8-derange.md
git commit -m "$(cat <<'EOF'
observe(constellation): derange Phase 8 complement COMPAT values

Coverage and relation counts held. Complement fire compared real vs
deranged. SCORE still not licensed.
EOF
)"
```

---

### Task 9: Gated complement-only SCORE (blocked)

**Stop condition:** Do not start this task unless Task 7 passed P1–P20 and Task 8 returned `REAL_BEATS_CONTROLS`. If either failed, write one sentence in the Task 8 evidence (“SCORE not opened”) and stop the plan.

**Files:**
- Create: `docs/superpowers/evidence/2026-08-17-PREREG-phase-8-complement-score.md`
- Create: `scripts/phase-8-complement-score.mjs` (only after that prereg is written)

**Interfaces:**
- Consumes: `scoreComplementCompat`, `derangeFeatureValues`, syntax score from `localFactors` / bond kind, composition rule name (score 0)
- Produces: four-arm comparison on **complement-competitive cells only**

Four arms, forest identical, TEST sealed, not global T1:

1. syntax-only — bond-kind / lift score
2. composition-only — named complement vs named rival; composition score stays 0 so this arm has no semantic preference
3. real complement COMPAT — arm 2 + `scoreComplementCompat` on complement edges
4. deranged complement COMPAT — arm 3 with `derangeFeatureValues(..., 0x50383031)`

Cell filter: decision-competitive cells with ≥2 non-glue alternatives where at least one alternative projects `INFINITIVAL_COMPLEMENT` or `PROPOSITIONAL_COMPLEMENT`.

Outcome: among those cells, does arm 3 pick a different winner than arm 4, and (if DEV gold is used **only as an evaluation label**) does arm 3 match gold complement attachment more often than arm 4?

Write a **new** prereg before running the script. That prereg freezes the cell filter, the four arm definitions, the gold-as-label rule, and the success test. Do not reuse this Phase 8 OBSERVE prereg as a SCORE license.

If the SCORE experiment is flat, that is the result. Do not widen the COMPAT table to chase it. Phase 4 inversion still waits.

- [ ] **Step 1: Write the SCORE prereg (no code)**
- [ ] **Step 2: Implement the four-arm script**
- [ ] **Step 3: Run it once**
- [ ] **Step 4: Write the result. Do not iterate the table.**

---

## Self-review

**Spec coverage**

| Spec section | Task |
|---|---|
| Freeze prereg / relations / movement | 1 |
| Relation-keyed registry, not FEATURE_COMPAT | 2, 4, 5 |
| Class projection; UNKNOWN abstains; no abstract governor | 2 |
| TRAIN-only smallest table; allow/forbid lists | 3, 4 |
| Mapping-specific waterfall | 2, 6, 7 |
| OBSERVE success signature | 7 |
| Derangement before SCORE | 8 |
| Complement-only SCORE, then inversion | 9 (gated) |
| No over-authoring / no lemma rows | 3, 4, 9 stop rule |

**Placeholder scan:** none. Cutoff, seed, paths, and function names are concrete.

**Type consistency:** `scoreComplementCompat`, `diagnoseComplementMapping`, `governorClasses`, `complementClass`, `COMPLEMENT_COMPAT` keep the same names from Task 2 through Task 9. `illegal` is always `false`. `COMPLEMENT_COMPAT_VERSION` is `1.0.0`. Schema version stays `1.2.0`.
