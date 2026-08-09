# ConstellationOS Poetic Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local-only ConstellationOS discovery channel that answers poetic meta-queries (e.g. *words that resemble darkness but feel more emotional*) as ranked evidenced hits via PLS ranking, while literary phrases surface honest Leximancy anchors and phrase structure.

**Architecture:** Pure parse → pure plan (generators / constraints / scorer profile) → adapter expand (lexicon + rhyme) → hard constrain → discovery pre-scores → existing PLS `rankCandidates` → `packet.discovery`. No parallel ranker. No Datamuse. Server ranks; client maps fields only.

**Tech Stack:** Node ESM, Vitest, existing lexicon/rhyme adapters, `src/lib/pls/ranker.js`, React result shell.

**Spec:** `docs/superpowers/specs/2026-08-07-constellationos-poetic-discovery-design.md` (rev 2, owner-approved)

## Global Constraints

- **Local only:** no Datamuse / external HTTP on the discovery path.
- **No parallel ranker:** only `rankCandidates` from `src/lib/pls/ranker.js`.
- **Hard rhyme:** `constraints.rhymeWith !== null` ⇒ filter before ranking; every returned hit must have rhyme evidence; never auto-relax.
- **Evidence before score/badge:** `modifierFit > 0` requires evidence paths; no badge without provenance.
- **Rarity invariant:** `rarityBoost = 0` when base generator evidence is empty.
- **Canonical generator order:** synonyms → related → symbols → fts; max 40/source/seed; global max 80 pre-constraint; top N = 12; sort score desc then token asc.
- **Adapter reads ordered:** every lexicon/rhyme read sorted deterministically (`lemma`/`token` ASC after fetch if DB unordered).
- **Discovery runs only when** `identity.intent === 'meta-query'`.
- **Literary UI copy frozen:** `Meaning anchored on "{token}"` — do not rephrase.
- **Gene:** client never recomputes linguistic rankings; maps `packet.discovery` only.
- **Degradation:** public channel `discovery`; internal `diagnostics.discovery.stage` ∈ parse|plan|expand|constrain|rank|ok.
- Run tests with `npx vitest run <path>`. Commit after each task.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `codex/core/constellation/discoveryInquiry.js` | Pure parse: operators first, seeds/modifiers/constraints |
| `codex/core/constellation/discoveryPlan.js` | Pure `buildDiscoveryPlan(parse)` |
| `codex/core/constellation/discoveryWeights.js` | Frozen profiles + K0/K1/K2 + caps |
| `codex/core/constellation/discoveryScoring.js` | Pure modifierFit, rarityBoost, pre-score apply |
| `codex/server/services/constellation/discovery.adapter.js` | expand → constrain → score → rank → channel payload |
| `codex/server/services/constellationPage.service.js` | Wire discovery for meta-query; diagnostics stage |
| `src/pages/Constellation/types.js` | JSDoc for discovery packet fields |
| `src/pages/Constellation/ConstellationResultShell.jsx` | Discovery Field plate + literary anchor copy |
| `src/pages/Constellation/ConstellationPage.css` | Minimal discovery list styles |
| `tests/qa/features/constellation-discoveryInquiry.test.js` | Parse fixtures |
| `tests/qa/features/constellation-discoveryPlan.test.js` | Plan fixtures |
| `tests/qa/features/constellation-discoveryScoring.test.js` | Provenance + rarity invariants |
| `tests/qa/features/constellation-discovery-adapter.test.js` | Expand/constrain/rank mocks |
| `tests/qa/features/constellationPage.service.test.js` | Extend: discovery channel + literary null |

---

### Task 1: Parse discovery inquiry (pure)

**Files:**
- Create: `codex/core/constellation/discoveryInquiry.js`
- Test: `tests/qa/features/constellation-discoveryInquiry.test.js`

**Interfaces:**
- Consumes: nothing (tokens from caller or string)
- Produces:
  - `parseDiscoveryInquiry(identityOrNormalized: { normalized?: string, tokens?: string[] } | string): DiscoveryParse`
  - `DiscoveryParse` fields: `status: 'ok'|'refuse'`, `relation`, `seeds: string[]`, `modifiers: string[]`, `modifierSources: Array<{token, source: 'span'|'known-tone'}>`, `constraints: { rhymeWith: string|null }`, `reasons: string[]`, `refusal: string|null`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-discoveryInquiry.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { parseDiscoveryInquiry } from '../../../codex/core/constellation/discoveryInquiry.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

function parseQuery(q) {
  return parseDiscoveryInquiry(resolveQueryIdentity(q));
}

describe('parseDiscoveryInquiry', () => {
  it('parses resemble + feel more emotional', () => {
    const p = parseQuery('Words that resemble darkness but feel more emotional');
    expect(p.status).toBe('ok');
    expect(p.seeds).toEqual(['darkness']);
    expect(p.relation).toBe('resemble');
    expect(p.modifiers).toEqual(['emotional']);
    expect(p.modifierSources[0]).toEqual({ token: 'emotional', source: 'span' });
    expect(p.constraints.rhymeWith).toBeNull();
  });

  it('parses rhyme with gravity + spiritual modifier', () => {
    const p = parseQuery('words that rhyme with gravity but feel spiritual');
    expect(p.status).toBe('ok');
    expect(p.relation).toBe('rhyme');
    expect(p.constraints.rhymeWith).toBe('gravity');
    expect(p.seeds).toContain('gravity');
    expect(p.modifiers).toEqual(['spiritual']);
  });

  it('parses near grief + hard rhyme with sea', () => {
    const p = parseQuery('words semantically near grief that rhyme with sea');
    expect(p.status).toBe('ok');
    expect(p.relation).toBe('near');
    expect(p.seeds).toEqual(['grief']);
    expect(p.constraints.rhymeWith).toBe('sea');
    expect(p.modifiers).toEqual([]);
  });

  it('treats unknown token after more as span modifier (sepulchral)', () => {
    const p = parseQuery('words like winter but more sepulchral');
    expect(p.seeds).toEqual(['winter']);
    expect(p.relation).toBe('resemble');
    expect(p.modifiers).toEqual(['sepulchral']);
    expect(p.modifierSources[0].source).toBe('span');
  });

  it('refuses when no seeds remain', () => {
    const p = parseQuery('words that feel more');
    expect(p.status).toBe('refuse');
    expect(p.seeds).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/qa/features/constellation-discoveryInquiry.test.js
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `discoveryInquiry.js`**

Implement operator-first parse:

1. Normalize tokens (lowercase array from identity.tokens or split normalized).
2. Scan for rhyme-with span: index of `rhyme`/`rhymes` then `with` then next non-structural content → `constraints.rhymeWith`.
3. Scan for relation: if rhyme span only / primary → `rhyme`; else if opposite/antonym → `opposite`; else if resemble/resembling/like/near/similar/semantically → map to `resemble` or `near` (prefer `near` when token `near` or `semantically` present without resemble/like); else if seeds later → `near`.
4. Modifier span: after first of `but`/`feel`/`feels`/`feeling`/`more`/`less` (with care: `more` alone starts span of following tokens until end or next operator), collect content tokens → modifiers with `source: 'span'`.
5. Optionally add known-tone hits elsewhere with `source: 'known-tone'` only if not already span-captured. Bootstrap set: `emotional`, `spiritual`, `darker`, `softer`, `lighter`, `sharper`, `gentler`.
6. Structural tokens excluded from seeds: meta (`words`,`word`,`find`,`show`,`list`,`give`,`tell`,`search`,`lookup`), operators (`that`,`which`,`with`,`but`,`feel*`,`more`,`less`,`like`,`resemble*`,`near`,`similar`,`semantically`,`rhyme*`,`opposite`,`antonym`,`to`,`of`,`for`,`a`,`an`,`the`,`me`,`please`,`and`), and all constraint/modifier tokens.
7. Seeds = remaining content tokens (length ≥ 2), stable order of first appearance. If rhyme-only query and seed empty, seed = `[rhymeWith]`.
8. Refuse if seeds empty.

Export `KNOWN_TONE_MODIFIERS` frozen Set for tests if useful.

- [ ] **Step 4: Run tests — pass**

```bash
npx vitest run tests/qa/features/constellation-discoveryInquiry.test.js
```

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/discoveryInquiry.js tests/qa/features/constellation-discoveryInquiry.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): pure discovery inquiry parse (operator-first)

EOF
)"
```

---

### Task 2: Discovery plan builder (pure)

**Files:**
- Create: `codex/core/constellation/discoveryPlan.js`
- Test: `tests/qa/features/constellation-discoveryPlan.test.js`

**Interfaces:**
- Consumes: `DiscoveryParse` from Task 1
- Produces:
  - `buildDiscoveryPlan(parse): DiscoveryPlan`
  - `DiscoveryPlan`: `{ mode, generators: Array<{type:'semantic'|'antonym'|'rhyme', seed:string}>, constraints: Array<{type:'rhymeWith', token:string}>, scorerProfile: 'semantic'|'rhyme-forward', modifiers, seeds, relation }`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { parseDiscoveryInquiry } from '../../../codex/core/constellation/discoveryInquiry.js';
import { buildDiscoveryPlan } from '../../../codex/core/constellation/discoveryPlan.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

const planFor = (q) => buildDiscoveryPlan(parseDiscoveryInquiry(resolveQueryIdentity(q)));

describe('buildDiscoveryPlan', () => {
  it('grief + rhyme with sea → semantic gen + hard rhyme constraint', () => {
    const plan = planFor('words semantically near grief that rhyme with sea');
    expect(plan.generators).toEqual([{ type: 'semantic', seed: 'grief' }]);
    expect(plan.constraints).toEqual([{ type: 'rhymeWith', token: 'sea' }]);
    expect(plan.mode).toBe('semantic+rhyme');
    expect(plan.scorerProfile).toBe('semantic');
  });

  it('rhyme with gravity → rhyme generator + rhyme-forward', () => {
    const plan = planFor('words that rhyme with gravity but feel spiritual');
    expect(plan.generators.some((g) => g.type === 'rhyme')).toBe(true);
    expect(plan.constraints).toEqual([{ type: 'rhymeWith', token: 'gravity' }]);
    expect(plan.mode).toBe('rhyme');
    expect(plan.scorerProfile).toBe('rhyme-forward');
    expect(plan.modifiers).toEqual(['spiritual']);
  });

  it('resemble darkness → semantic only', () => {
    const plan = planFor('Words that resemble darkness but feel more emotional');
    expect(plan.generators).toEqual([{ type: 'semantic', seed: 'darkness' }]);
    expect(plan.constraints).toEqual([]);
    expect(plan.mode).toBe('semantic');
  });

  it('returns null-plan shape for refuse parse', () => {
    const plan = buildDiscoveryPlan(parseDiscoveryInquiry(resolveQueryIdentity('words that feel more')));
    expect(plan).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/qa/features/constellation-discoveryPlan.test.js
```

- [ ] **Step 3: Implement `buildDiscoveryPlan`**

Rules:
- If `parse.status !== 'ok'` return `null`.
- Generators:
  - `opposite` → one `antonym` gen per seed
  - `rhyme` → one `rhyme` gen on `rhymeWith || seeds[0]`
  - else (`resemble`/`near`/default) → one `semantic` gen per seed
- Constraints: if `parse.constraints.rhymeWith` → push `{ type: 'rhymeWith', token }` (always hard)
- For pure rhyme relation, still include hard constraint when rhymeWith set
- `mode`:
  - has semantic/antonym gen AND rhyme constraint → `semantic+rhyme`
  - rhyme gen only (no semantic/antonym) → `rhyme`
  - else → `semantic`
- `scorerProfile`: `rhyme-forward` if mode is `rhyme` OR (relation === `rhyme` and no semantic gen); else `semantic`
- Copy modifiers, seeds, relation onto plan

- [ ] **Step 4: Run tests — pass**

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/discoveryPlan.js tests/qa/features/constellation-discoveryPlan.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): discovery plan builder (gen/constraint/profile)

EOF
)"
```

---

### Task 3: Weights + pure discovery scoring

**Files:**
- Create: `codex/core/constellation/discoveryWeights.js`
- Create: `codex/core/constellation/discoveryScoring.js`
- Test: `tests/qa/features/constellation-discoveryScoring.test.js`

**Interfaces:**
- Produces:
  - `DISCOVERY_HIT_LIMIT = 12`
  - `DISCOVERY_PER_SOURCE_CAP = 40`
  - `DISCOVERY_GLOBAL_CAP = 80`
  - `DISCOVERY_SOURCE_ORDER = ['synonyms','related','symbols','fts']`
  - `WEIGHT_PROFILES.semantic` / `.rhyme-forward` (objects with rhyme, prefix:0, synonym, validity, democracy, predictability, meter, color)
  - `PRE_SCORE = { K0: 0.55, K1: 0.30, K2: 0.15 }`
  - `computeModifierFit(candidate, attractorSet, glossTokens): { score, paths }`
  - `computeRarityBoost(baseEvidence, rarityBandOrNull): number` // 0 if !baseEvidence
  - `applyDiscoveryPreScore(synonymScore, modifierFit, rarityBoost): number`
  - `buildHitEvidence(modifierFitResult, rarityBoost): Array<{signal, score, paths}>`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import {
  computeModifierFit,
  computeRarityBoost,
  applyDiscoveryPreScore,
} from '../../../codex/core/constellation/discoveryScoring.js';
import { PRE_SCORE } from '../../../codex/core/constellation/discoveryWeights.js';

describe('discoveryScoring', () => {
  it('modifierFit is 0 without evidence paths even if attractors non-empty', () => {
    const r = computeModifierFit('abyss', new Set(['emotion', 'feeling']), []);
    expect(r.score).toBe(0);
    expect(r.paths).toEqual([]);
  });

  it('modifierFit records paths when gloss overlaps attractor', () => {
    const r = computeModifierFit(
      'sorrow',
      new Set(['emotion', 'feeling', 'sorrow']),
      ['deep', 'sorrow', 'pain'],
    );
    expect(r.score).toBeGreaterThan(0);
    expect(r.paths.some((p) => p.includes('sorrow'))).toBe(true);
  });

  it('rarityBoost is 0 when baseEvidence is false', () => {
    expect(computeRarityBoost(false, 8)).toBe(0);
  });

  it('rarityBoost is positive when baseEvidence and high rarity band', () => {
    expect(computeRarityBoost(true, 8)).toBeGreaterThan(0);
    expect(computeRarityBoost(true, 8)).toBeLessThanOrEqual(1);
  });

  it('pre-score formula is deterministic', () => {
    const s = applyDiscoveryPreScore(0.8, 0.5, 0.2);
    const expected = Math.min(1, Math.max(0, 0.8 * (PRE_SCORE.K0 + PRE_SCORE.K1 * 0.5 + PRE_SCORE.K2 * 0.2)));
    expect(s).toBeCloseTo(expected, 8);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement weights + scoring**

`computeModifierFit`: intersection of `glossTokens` (lowercased) with `attractorSet`; score = |intersection| / max(1, attractorSet.size) clamped 0–1; paths = `intersection` mapped to `candidate-gloss:{token}` (and optionally `modifier-related:{token}` if token only in attractors). If intersection empty, score 0 paths [].

`computeRarityBoost(baseEvidence, band)`: if !baseEvidence return 0; map band 1–9 → small 0–0.4 boost (e.g. `(band/9)*0.4`).

`applyDiscoveryPreScore`: clamp01(syn * (K0 + K1*mod + K2*rar)).

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/discoveryWeights.js codex/core/constellation/discoveryScoring.js tests/qa/features/constellation-discoveryScoring.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): discovery weights and provenance-safe scoring

EOF
)"
```

---

### Task 4: Discovery adapter — expand, constrain, rank

**Files:**
- Create: `codex/server/services/constellation/discovery.adapter.js`
- Test: `tests/qa/features/constellation-discovery-adapter.test.js`

**Interfaces:**
- Consumes: plan, parse, deps `{ lexiconAdapter, rhymeQueryEngine?, rhymeLexiconRepo?, phonemeEngine? }`
- Produces:
  - `export const DISCOVERY_ADAPTER_VERSION = 'disc-adapter-1'`
  - `export async function analyzeDiscovery(rawQuery, identity, deps): DiscoveryChannel | null`
  - DiscoveryChannel matches packet field in §4.9 of spec (`status`, `mode`, `relation`, `seeds`, `modifiers`, `constraints`, `hits`, `warnings`, `parse`)

**Expand rules (implement exactly):**
1. `buildDiscoveryPlan(parse)`; if null → `{ status:'refused', ... empty hits, constraints from parse }`
2. For each generator in order:
   - `semantic` / `antonym`: walk `DISCOVERY_SOURCE_ORDER`; fetch; sort lemmas ASC; take cap; record via `synonym:seed` etc.
   - `rhyme`: query rhyme engine for seed/token; collect tokens; sort ASC; via `rhyme:token`
3. Dedupe first-seen; stop at GLOBAL_CAP
4. Apply constraints: for `rhymeWith`, keep only tokens where `hasRhymeEvidence(token, rhymeWith, deps)` is true (exact rhyme member or slant match from engine/repo — implement with mocked-friendly: `rhymeLexiconRepo.rhymesWith?.(a,b)` OR query engine returns members set OR phoneme rhymeKey equality if available). If rhyme deps missing and constraint present → all drop + warning.
5. Build attractor set: for each modifier, synonyms+related (capped 15 each, sorted) of modifier lemma
6. For each survivor, base synonym score from generator rank (1 - i/n) or 0.5 default; apply modifierFit + rarityBoost; pre-score
7. `rankCandidates({ synonym: generatorResults, rhyme: rhymeGenResults, prefix: [] }, { meter:[], color:[], validity: all1, democracy:[], predictability:[] }, WEIGHT_PROFILES[profile], {}, DISCOVERY_HIT_LIMIT)`
8. Map ranked → hits with badges only when evidence paths exist (`SYNONYM` if via includes synonym, `RHYME` if via/constraint, `MODIFIER` if modifierFit>0, `RARE` if rarityBoost>0)

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect } from 'vitest';
import { analyzeDiscovery, DISCOVERY_ADAPTER_VERSION } from '../../../codex/server/services/constellation/discovery.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

function mockLexicon({ graph = {}, freqs = {} } = {}) {
  // graph: word -> { synonyms:[], related:{broader,narrower,akin}, antonyms:[], symbols:[], fts:[], gloss:{} }
  const g = (w) => graph[w] || {};
  return {
    lookupSynonyms: (w) => (g(w).synonyms || []).map((lemma) => ({ lemma })),
    lookupAntonyms: (w) => (g(w).antonyms || []).map((lemma) => ({ lemma })),
    lookupRelated: (w) => {
      const r = g(w).related || {};
      return {
        broader: (r.broader || []).map((lemma) => ({ lemma })),
        narrower: (r.narrower || []).map((lemma) => ({ lemma })),
        akin: (r.akin || []).map((lemma) => ({ lemma })),
      };
    },
    lookupSymbolsLoose: (w) => (g(w).symbols || []).map((lemma) => ({ lemma })),
    searchEntries: (w) => (g(w).fts || []).map((headword) => ({ headword })),
    extractGloss: () => '',
    getCorpusFrequencies: (words) => new Map(words.map((x) => [x, freqs[x] ?? 100])),
    lookupWord: (w) => {
      const gloss = g(w).gloss;
      if (!gloss) return [];
      return [{ pos: 'n', senses: [{ gloss }], etymology: null, pronunciation: null }];
    },
  };
}

describe('analyzeDiscovery', () => {
  it('ranks abyss for darkness + emotional when graph supports it', async () => {
    const lexiconAdapter = mockLexicon({
      graph: {
        darkness: {
          synonyms: ['gloom', 'abyss', 'night'],
          related: { akin: ['shadow'] },
          gloss: { abyss: 'immeasurably deep space; emotional void' },
        },
        emotional: { synonyms: ['feeling', 'emotion'] },
        abyss: { gloss: 'deep emotional void' },
        gloom: { gloss: 'partial darkness' },
        night: { gloss: 'period of darkness' },
        shadow: { gloss: 'dark shape' },
      },
      freqs: { abyss: 5, gloom: 200, night: 500, shadow: 100 },
    });
    // enrich lookupWord gloss for candidates
    lexiconAdapter.lookupWord = (w) => {
      const glosses = {
        abyss: 'deep emotional void',
        gloom: 'partial darkness',
        night: 'period of darkness',
        shadow: 'dark shape',
      };
      return glosses[w] ? [{ pos: 'n', senses: [{ gloss: glosses[w] }] }] : [];
    };
    const identity = resolveQueryIdentity('Words that resemble darkness but feel more emotional');
    const d = await analyzeDiscovery(identity.raw, identity, { lexiconAdapter });
    expect(d.status).toBe('resolved');
    expect(d.mode).toBe('semantic');
    expect(d.hits.map((h) => h.token)).toContain('abyss');
    expect(d.hits.find((h) => h.token === 'abyss').via.length).toBeGreaterThan(0);
  });

  it('hard-filters rhyme: every hit rhymes with sea', async () => {
    const lexiconAdapter = mockLexicon({
      graph: {
        grief: { synonyms: ['sorrow', 'plea', 'misery', 'table'] },
      },
    });
    const rhymeSet = new Set(['plea', 'decree', 'sea']);
    const deps = {
      lexiconAdapter,
      rhymeLexiconRepo: {
        rhymesWith: (a, b) => {
          if (b === 'sea') return rhymeSet.has(a);
          return false;
        },
        lookupNodeByNormalized: () => null,
      },
    };
    const identity = resolveQueryIdentity('words semantically near grief that rhyme with sea');
    const d = await analyzeDiscovery(identity.raw, identity, deps);
    expect(d.constraints.rhymeWith).toBe('sea');
    expect(d.mode).toBe('semantic+rhyme');
    for (const h of d.hits) {
      expect(rhymeSet.has(h.token) || h.token === 'plea').toBe(true);
      expect(h.token).not.toBe('table');
      expect(h.token).not.toBe('sorrow'); // unless in rhyme set
    }
    expect(d.hits.every((h) => rhymeSet.has(h.token))).toBe(true);
  });

  it('enumeration is order-stable under shuffled synonym input', async () => {
    const make = (syns) => mockLexicon({ graph: { darkness: { synonyms: syns } } });
    const identity = resolveQueryIdentity('words that resemble darkness');
    const a = await analyzeDiscovery(identity.raw, identity, {
      lexiconAdapter: make(['night', 'gloom', 'abyss']),
    });
    const b = await analyzeDiscovery(identity.raw, identity, {
      lexiconAdapter: make(['abyss', 'night', 'gloom']),
    });
    expect(a.hits.map((h) => h.token)).toEqual(b.hits.map((h) => h.token));
  });

  it('rarity cannot promote zero-evidence candidate', async () => {
    // Only gloom has via; rare glitter word never enters without generator path
    const lexiconAdapter = mockLexicon({
      graph: { darkness: { synonyms: ['gloom'] } },
      freqs: { gloom: 500, glitteryx: 1 },
    });
    const identity = resolveQueryIdentity('words that resemble darkness');
    const d = await analyzeDiscovery(identity.raw, identity, { lexiconAdapter });
    expect(d.hits.map((h) => h.token)).not.toContain('glitteryx');
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement adapter**

Import pure modules + `rankCandidates` from `../../../../src/lib/pls/ranker.js` (path relative from adapter). Keep implementation focused; extract helpers `expandSemantic`, `expandRhyme`, `applyRhymeConstraint`, `glossTokensFor` inside the file.

For `hasRhymeEvidence(candidate, target, deps)`:
1. If `rhymeLexiconRepo.rhymesWith` exists → use it
2. Else if `rhymeQueryEngine.query` → query target mode word, check members/topMatches tokens
3. Else false

Always sort after fetch.

- [ ] **Step 4: Run adapter tests — PASS**

```bash
npx vitest run tests/qa/features/constellation-discovery-adapter.test.js
```

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellation/discovery.adapter.js tests/qa/features/constellation-discovery-adapter.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): discovery adapter expand/constrain/PLS rank

EOF
)"
```

---

### Task 5: Wire constellationPage.service + diagnostics

**Files:**
- Modify: `codex/server/services/constellationPage.service.js`
- Modify: `tests/qa/features/constellationPage.service.test.js`
- Modify: `src/pages/Constellation/types.js` (JSDoc only)

**Interfaces:**
- Consumes: `analyzeDiscovery`, `DISCOVERY_ADAPTER_VERSION`
- Produces: packet fields `discovery`, `diagnostics.discovery`, `provenance.engineVersions.discovery`

- [ ] **Step 1: Write failing service tests** (append to existing file)

```js
  it('returns discovery hits for meta-query and null for literary', async () => {
    const lexiconAdapter = {
      ...deps.lexiconAdapter,
      lookupSynonyms: (w) => (w === 'darkness' ? [{ lemma: 'abyss' }] : []),
      lookupAntonyms: () => [],
      lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
      lookupSymbolsLoose: () => [],
      searchEntries: () => [],
      lookupWord: (w) => (w === 'abyss'
        ? [{ pos: 'n', senses: [{ gloss: 'emotional deep' }] }]
        : deps.lexiconAdapter.lookupWord(w)),
      getCorpusFrequencies: (words) => new Map(words.map((w) => [w, w === 'abyss' ? 3 : 100])),
    };
    const meta = await buildConstellationPage(
      'Words that resemble darkness but feel more emotional',
      { ...deps, lexiconAdapter },
    );
    expect(meta.query.intent).toBe('meta-query');
    expect(meta.discovery).not.toBeNull();
    expect(meta.discovery.status).toMatch(/resolved|empty/);
    expect(meta.diagnostics.discovery.stage).toBe('ok');
    expect(meta.provenance.engineVersions.discovery).toBeTruthy();

    const lit = await buildConstellationPage('the bright wound of morning', deps);
    expect(lit.discovery).toBeNull();
  });

  it('degrades discovery channel on throw without killing page', async () => {
    const broken = {
      ...deps,
      lexiconAdapter: {
        ...deps.lexiconAdapter,
        lookupSynonyms: () => { throw new Error('boom'); },
        lookupRelated: () => { throw new Error('boom'); },
      },
    };
    // Force meta path with a query that expands
    const p = await buildConstellationPage('find words similar to darkness', broken);
    // Either refused/empty with stage, or degraded
    expect(p.leximancy).toBeTruthy();
    expect(p.pageBytecode).toMatch(/^COS-PAGE-v1-/);
  });
```

Note: if `lookupSynonyms` throw only happens inside discovery expand, leximancy may still work. Assert `diagnostics.degradedChannels` includes `discovery` **or** discovery status empty with stage set — implement service so expand throw → catch → `degradedChannels.push('discovery')`, `diagnostics.discovery = { stage: 'expand', message }`, `discovery: null`.

- [ ] **Step 2: Run — FAIL until wired**

- [ ] **Step 3: Wire service**

After phrase structure / before or after leximancy:

```js
let discovery = null;
let discoveryDiag = { stage: 'ok', message: null };
if (identity.intent === 'meta-query') {
  try {
    discoveryDiag.stage = 'parse';
    discovery = await analyzeDiscovery(rawQuery, identity, {
      lexiconAdapter: deps.lexiconAdapter,
      rhymeQueryEngine: deps.rhymeQueryEngine,
      rhymeLexiconRepo: deps.rhymeLexiconRepo,
      phonemeEngine: deps.phonemeEngine,
    });
    discoveryDiag.stage = 'ok';
  } catch (err) {
    degradedChannels.push('discovery');
    warnings.push(`discovery channel failed: ${err.message}`);
    discoveryDiag = { stage: 'expand', message: err.message };
    discovery = null;
  }
}
```

Prefer having the adapter set internal stages and rethrow or return status — simplest: adapter never throws on empty; only unexpected throws. Adapter returns refused/empty itself.

Add to return packet:
```js
discovery,
diagnostics: { degradedChannels, warnings, discovery: discoveryDiag },
// engineVersions.discovery: DISCOVERY_ADAPTER_VERSION always when code path exists
```

Bump `CONSTELLATION_OS_VERSION` minor comment only if desired; include discovery version always in engineVersions for deterministic bytecode when code ships (even when discovery null — same as other channels' versions present).

- [ ] **Step 4: Run service tests**

```bash
npx vitest run tests/qa/features/constellationPage.service.test.js
```

- [ ] **Step 5: Update types.js JSDoc** for optional `discovery` on packet

- [ ] **Step 6: Commit**

```bash
git add codex/server/services/constellationPage.service.js tests/qa/features/constellationPage.service.test.js src/pages/Constellation/types.js
git commit -m "$(cat <<'EOF'
feat(constellation): wire discovery channel into page service

EOF
)"
```

---

### Task 6: Result shell — Discovery Field + literary anchor

**Files:**
- Modify: `src/pages/Constellation/ConstellationResultShell.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Optional light test if project has shell tests; otherwise manual verify

**Interfaces:**
- Consumes: `packet.discovery`, `packet.phraseStructure`, `leximancy.anchor|lookupToken|compoundUsed`

- [ ] **Step 1: Literary anchor copy**

In `MeaningBody` (or above interpretations list), when `leximancy.anchor || leximancy.lookupToken`:

```jsx
<p className="constellation-result-anchor" data-testid="constellation-lexical-anchor">
  Meaning anchored on &ldquo;{leximancy.lookupToken || leximancy.anchor}&rdquo;
  {leximancy.compoundUsed ? ` (from ${leximancy.compoundUsed})` : ''}
</p>
```

Use exact phrase: **Meaning anchored on "{token}"**

- [ ] **Step 2: Phrase structure chips** (if `packet.phraseStructure`)

Under masthead chips or new compact dl: intent, headToken, compounds joined, devices joined — only when present.

- [ ] **Step 3: Discovery Field plate**

In `ComposedResultShell`, after masthead, when `packet.discovery != null`:

```jsx
<section
  className="constellation-result-plate"
  data-compose-part="discovery-field"
  aria-labelledby="cos-discovery"
>
  <h2 id="cos-discovery" className="constellation-result-plate__overline">Discovery Field</h2>
  {/* mode chip, seeds, constraints.rhymeWith */}
  {/* list hits: token, score, badges, first reason */}
  {/* empty: No local kin found for this inquiry */}
</section>
```

For meta-query, place Discovery Field **before** Leximancy plate.

- [ ] **Step 4: CSS**

Minimal styles mirroring existing plate list/chip patterns — no new palette invent.

- [ ] **Step 5: Smoke existing constellation UI tests if any**

```bash
npx vitest run tests/qa/features/constellationPage.service.test.js tests/qa/features/constellation-discovery
```

- [ ] **Step 6: Commit**

```bash
git add src/pages/Constellation/ConstellationResultShell.jsx src/pages/Constellation/ConstellationPage.css
git commit -m "$(cat <<'EOF'
feat(constellation): Discovery Field UI and literary anchor honesty

EOF
)"
```

---

### Task 7: Golden integration + regression suite pass

**Files:**
- Extend: `tests/qa/features/constellation-discovery-adapter.test.js` and/or service tests for any remaining goldens
- No new product code unless failures

- [ ] **Step 1: Ensure all four goldens exist and pass**

1. darkness + emotional → abyss in hits (adapter)  
2. grief ∩ sea → all hits rhyme-evidenced  
3. winter + sepulchral → parse seed/modifier  
4. rarity glitter excluded  
5. enumeration shuffle stability  

- [ ] **Step 2: Run full constellation QA bundle**

```bash
npx vitest run tests/qa/features/constellation
```

Expected: all green.

- [ ] **Step 3: Fix only regressions found**

- [ ] **Step 4: Final commit if fixes**

```bash
git add -A tests/qa/features/constellation*
git commit -m "$(cat <<'EOF'
test(constellation): golden fixtures for poetic discovery

EOF
)"
```

---

## Spec coverage checklist (plan self-review)

| Spec requirement | Task |
|------------------|------|
| Operator-first parse | T1 |
| Span OR known-tone modifiers | T1 |
| buildDiscoveryPlan gen/constraint/profile/mode | T2 |
| Hard rhyme constraint | T2, T4 |
| Generators order + caps + ordered reads | T4 |
| modifierFit provenance floor | T3, T4 |
| rarityBoost invariant | T3, T4 |
| PLS rankCandidates only | T4 |
| Packet mode + constraints + evidence | T4, T5 |
| diagnostics.discovery.stage | T5 |
| meta-query only | T5 |
| Literary Meaning anchored on | T6 |
| Discovery Field UI | T6 |
| Golden fixtures | T4, T7 |
| No Datamuse / no parallel ranker | Global + T4 |

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-08-07-constellationos-poetic-discovery.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session with executing-plans, batch + checkpoints  

Which approach?
