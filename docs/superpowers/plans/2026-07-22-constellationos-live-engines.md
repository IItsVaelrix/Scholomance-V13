# ConstellationOS Phase-1 Live Engines Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ConstellationOS fixture with real Leximancy, Rhyme Astrology, and Phrase Genome output behind one server-authoritative `GET /api/constellation/page` route, keeping the fixture as the offline/degradation fallback.

**Architecture:** A thin server service composes three independent channels — Leximancy (lexicon adapter), Rhyme Astrology (rhyme query engine + RA lexicon repo), Phrase Genome (derived from the RA result via `schools.js`) — into the existing `ConstellationPhase1Packet`. The client hook fetches on submit and maps confirmed fields; it never recomputes phoneme/vowel-family truth. Each channel degrades locally.

**Tech Stack:** Node (ESM), Fastify, Vitest, zod (existing RA contracts), React hooks. Pure core in `codex/core/constellation/`, adapters + service + route under `codex/server/`, client in `src/hooks/`.

## Global Constraints

- **Gene directive `BUGPATTERN_COLOR_DRAGON_FRONTEND_FALLBACK`:** the client renders backend phoneme/resonance/vowel-family indices ONLY. No client-side phoneme, vowel-family, rhyme, or school computation. Missing backend data → "awaiting", never a client-recomputed value.
- **VAELRIX Law 6:** pure core functions are deterministic — no `Math.random`, no `Date.now` in `queryIdentity.js` / `pageBytecode.js` / adapters' pure logic.
- **PDR §7.3 evidence before explanation:** a channel returning nothing yields `null`/empty; never invent glosses, rhymes, or school.
- **PDR §7.4 ambiguity is data:** competing interpretations preserved; never force a pick.
- **PDR §7.6 determinism:** identical normalized query + engine versions + scoring constants ⇒ identical `pageBytecode`; exclude timing/cache/user from the basis.
- **PDR §7.8 failure stays local:** one channel failing lists it in `diagnostics.degradedChannels`; others still render. Whole-request failure → client fixture fallback.
- **Packet shape frozen:** conform to `ConstellationPhase1Packet` in `src/pages/Constellation/types.js`. Do not edit the result-shell UI.
- **Contract version:** `CONSTELLATION_CONTRACT_VERSION = 'cos-page-phase1-v1'` (used in bytecode basis + provenance).
- Run tests with `npx vitest run <path>`. Commit after each task.

---

## File Structure

| File | Responsibility |
|---|---|
| `codex/core/constellation/queryIdentity.js` | Pure: normalize query, derive kind + token/grapheme counts + primary content token |
| `codex/core/constellation/pageBytecode.js` | Pure: `fnv1a32` over the deterministic basis → `COS-PAGE-v1-{hex}` |
| `codex/core/constellation/stopwords.js` | Pure: frozen stopword set for content-token selection |
| `codex/server/services/constellation/leximancy.adapter.js` | Lexicon adapter → interpretations + near-kin + counterfield + §11.3 refusal |
| `codex/server/services/constellation/rhymeAstrology.adapter.js` | RA query engine + RA lexicon repo → phonemes, stress, cadence, exact/slant |
| `codex/server/services/constellation/genome.adapter.js` | RA result → syllables (from phonemes), device hints, schoolHint (vowel-family→school) |
| `codex/server/services/constellationPage.service.js` | Compose channels + identity + bytecode → packet; record degradedChannels |
| `codex/server/routes/constellation.routes.js` | `GET /api/constellation/page`; validate query; inject singletons |
| `codex/server/index.js` | Register the route with the shared lexicon adapter + RA engine/repo |
| `src/hooks/useConstellationPage.js` | Fetch on submit (abortable); map response; fixture fallback on failure |
| `tests/qa/features/constellation-queryIdentity.test.js` | Core identity tests |
| `tests/qa/features/constellation-pageBytecode.test.js` | Bytecode determinism tests |
| `tests/qa/features/constellation-leximancy-adapter.test.js` | Refusal + mapping tests |
| `tests/qa/features/constellation-rhyme-adapter.test.js` | RA mapping tests |
| `tests/qa/features/constellation-genome-adapter.test.js` | Genome mapping tests |
| `tests/qa/features/constellationPage.service.test.js` | Composition + degradation tests |
| `tests/server/constellationPage.routes.test.js` | Route shape + validation tests |
| `tests/qa/features/useConstellationPage.test.js` | Client fetch + fallback tests (extend existing) |

---

### Task 1: Query identity (pure core)

**Files:**
- Create: `codex/core/constellation/stopwords.js`
- Create: `codex/core/constellation/queryIdentity.js`
- Test: `tests/qa/features/constellation-queryIdentity.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `STOPWORDS: Set<string>`
  - `resolveQueryIdentity(rawQuery: string): { raw, normalized, kind, tokenCount, graphemeCount, tokens: string[], primaryContentToken: string | null }`
  - `kind` ∈ `'word' | 'phrase' | 'line' | 'multiline'`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-queryIdentity.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

describe('resolveQueryIdentity', () => {
  it('classifies a single word', () => {
    const id = resolveQueryIdentity('  Gravity ');
    expect(id.normalized).toBe('gravity');
    expect(id.kind).toBe('word');
    expect(id.tokenCount).toBe(1);
    expect(id.graphemeCount).toBe(7);
    expect(id.primaryContentToken).toBe('gravity');
  });

  it('classifies a phrase and skips stopwords for the content token', () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    expect(id.kind).toBe('phrase');
    expect(id.tokenCount).toBe(5);
    // last non-stopword content token
    expect(id.primaryContentToken).toBe('morning');
  });

  it('classifies multiline input', () => {
    const id = resolveQueryIdentity('first line\nsecond line');
    expect(id.kind).toBe('multiline');
  });

  it('counts unicode graphemes, not code units', () => {
    const id = resolveQueryIdentity('café');
    expect(id.graphemeCount).toBe(4);
  });

  it('returns null content token when the query is all stopwords', () => {
    const id = resolveQueryIdentity('the of and');
    expect(id.primaryContentToken).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-queryIdentity.test.js`
Expected: FAIL — cannot resolve `queryIdentity.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/core/constellation/stopwords.js`:

```js
/** Frozen function-word set for content-token selection (PDR §3.2 anchor rule). */
export const STOPWORDS = new Set([
  'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'into',
  'of', 'on', 'or', 'the', 'to', 'with', 'is', 'it', 'its', 'that', 'this',
]);
```

Create `codex/core/constellation/queryIdentity.js`:

```js
import { STOPWORDS } from './stopwords.js';

function normalizeQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function splitTokens(normalized) {
  if (!normalized) return [];
  return normalized.split(/\s+/).filter(Boolean);
}

/**
 * @param {string} rawQuery
 * @returns {{ raw: string, normalized: string, kind: 'word'|'phrase'|'line'|'multiline',
 *   tokenCount: number, graphemeCount: number, tokens: string[], primaryContentToken: string|null }}
 */
export function resolveQueryIdentity(rawQuery) {
  const raw = String(rawQuery || '');
  const normalized = normalizeQuery(raw);
  const tokens = splitTokens(normalized);
  const hasNewline = /\n/.test(raw.trim());

  let kind;
  if (hasNewline) kind = 'multiline';
  else if (tokens.length <= 1) kind = 'word';
  else if (tokens.length <= 6) kind = 'phrase';
  else kind = 'line';

  // Primary content token: last non-stopword (PDR examples center on a head word).
  const content = tokens.filter((t) => !STOPWORDS.has(t));
  const primaryContentToken = content.length > 0 ? content[content.length - 1] : null;

  return {
    raw,
    normalized,
    kind,
    tokenCount: tokens.length,
    graphemeCount: [...normalized].length,
    tokens,
    primaryContentToken,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-queryIdentity.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/stopwords.js codex/core/constellation/queryIdentity.js \
  tests/qa/features/constellation-queryIdentity.test.js
git commit -m "feat(constellation): pure query identity + content-token rule"
```

---

### Task 2: Page bytecode (pure core)

**Files:**
- Create: `codex/core/constellation/pageBytecode.js`
- Test: `tests/qa/features/constellation-pageBytecode.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `CONSTELLATION_CONTRACT_VERSION: 'cos-page-phase1-v1'`
  - `fnv1a32(input: string): number`
  - `computePageBytecode(basis: { normalized: string, kind: string, engineVersions: Record<string,string> }): string` → `"COS-PAGE-v1-{HEX}"`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-pageBytecode.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { computePageBytecode, CONSTELLATION_CONTRACT_VERSION } from '../../../codex/core/constellation/pageBytecode.js';

const basis = {
  normalized: 'the bright wound of morning',
  kind: 'phrase',
  engineVersions: { leximancy: 'lex-1', rhymeAstrology: 'ra-1' },
};

describe('computePageBytecode', () => {
  it('is deterministic for the same basis', () => {
    expect(computePageBytecode(basis)).toBe(computePageBytecode(basis));
  });

  it('has the COS-PAGE-v1 prefix', () => {
    expect(computePageBytecode(basis)).toMatch(/^COS-PAGE-v1-[0-9A-F]+$/);
  });

  it('changes when the normalized query changes', () => {
    expect(computePageBytecode(basis)).not.toBe(
      computePageBytecode({ ...basis, normalized: 'gravity' }),
    );
  });

  it('changes when an engine version changes', () => {
    expect(computePageBytecode(basis)).not.toBe(
      computePageBytecode({ ...basis, engineVersions: { leximancy: 'lex-2', rhymeAstrology: 'ra-1' } }),
    );
  });

  it('exposes the contract version', () => {
    expect(CONSTELLATION_CONTRACT_VERSION).toBe('cos-page-phase1-v1');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-pageBytecode.test.js`
Expected: FAIL — cannot resolve `pageBytecode.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/core/constellation/pageBytecode.js`:

```js
export const CONSTELLATION_CONTRACT_VERSION = 'cos-page-phase1-v1';

/** FNV-1a 32-bit — the repo's deterministic seed convention. */
export function fnv1a32(input) {
  let hash = 0x811c9dc5;
  const s = String(input);
  for (let i = 0; i < s.length; i += 1) {
    hash ^= s.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Stable page bytecode. Basis excludes request time, cache status, and user
 * identity (PDR §16) — only inputs that legitimately change the analysis.
 * @param {{ normalized: string, kind: string, engineVersions: Record<string,string> }} basis
 * @returns {string}
 */
export function computePageBytecode(basis) {
  const versionKeys = Object.keys(basis.engineVersions || {}).sort();
  const versionPart = versionKeys.map((k) => `${k}=${basis.engineVersions[k]}`).join('|');
  const material = [
    CONSTELLATION_CONTRACT_VERSION,
    basis.normalized || '',
    basis.kind || '',
    versionPart,
  ].join('::');
  const hex = fnv1a32(material).toString(16).toUpperCase().padStart(8, '0');
  return `COS-PAGE-v1-${hex}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-pageBytecode.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/pageBytecode.js tests/qa/features/constellation-pageBytecode.test.js
git commit -m "feat(constellation): deterministic page bytecode"
```

---

### Task 3: Leximancy adapter

**Files:**
- Create: `codex/server/services/constellation/leximancy.adapter.js`
- Test: `tests/qa/features/constellation-leximancy-adapter.test.js`

**Interfaces:**
- Consumes: an injected `lexiconAdapter` with `lookupWord(word, n) → Array<{ pos, senses, source }>`, `extractGloss(senses) → string|null`, `lookupSynonyms(word, n) → Array<{ lemma }>`, `lookupAntonyms(word, n) → Array<{ lemma }>`. `resolveQueryIdentity` output for the anchor.
- Produces:
  - `LEXIMANCY_ADAPTER_VERSION: 'lex-adapter-1'`
  - `analyzeLeximancy(lexiconAdapter, contentToken: string|null): { status, selectedInterpretationId, interpretations, nearKin, counterfield, warnings, anchor }`
  - `interpretations`: `Array<{ id, gloss, confidence, pos }>`

**Refusal rule (PDR §11.3, Phase-1):** 0 senses → `unsupported`. 1 sense → `resolved` (selected). ≥2 senses whose top-2 differ in `pos` (a real polysemy signal, e.g. `wound` noun vs verb) → `ambiguous`, `selectedInterpretationId = null`. ≥2 same-pos senses → `resolved`, select the first (Leximancy's dominant rank). Constants `MIN_CONFIDENCE = 0.4`, `MIN_MARGIN = 0.08` reserved for when the lexicon returns real sense scores.

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-leximancy-adapter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { analyzeLeximancy } from '../../../codex/server/services/constellation/leximancy.adapter.js';

function fakeAdapter(sensesByWord, syn = [], ant = []) {
  return {
    lookupWord: (w) => sensesByWord[w] || [],
    extractGloss: (senses) => (senses && senses[0]) || null,
    lookupSynonyms: () => syn.map((lemma) => ({ lemma })),
    lookupAntonyms: () => ant.map((lemma) => ({ lemma })),
  };
}

describe('analyzeLeximancy', () => {
  it('marks a polyseme with divergent POS as ambiguous', () => {
    const adapter = fakeAdapter({
      wound: [
        { pos: 'noun', senses: ['injury / opening in flesh'], source: 's' },
        { pos: 'verb', senses: ['past tense of wind'], source: 's' },
      ],
    });
    const r = analyzeLeximancy(adapter, 'wound');
    expect(r.status).toBe('ambiguous');
    expect(r.selectedInterpretationId).toBeNull();
    expect(r.interpretations).toHaveLength(2);
    expect(r.interpretations[0].gloss).toMatch(/injury/);
  });

  it('resolves a single-sense word and selects it', () => {
    const adapter = fakeAdapter({ gravity: [{ pos: 'noun', senses: ['a force'], source: 's' }] });
    const r = analyzeLeximancy(adapter, 'gravity');
    expect(r.status).toBe('resolved');
    expect(r.selectedInterpretationId).toBe(r.interpretations[0].id);
  });

  it('reports unsupported when the word is unknown', () => {
    const r = analyzeLeximancy(fakeAdapter({}), 'zzzq');
    expect(r.status).toBe('unsupported');
    expect(r.interpretations).toEqual([]);
  });

  it('maps synonyms to nearKin and antonyms to counterfield', () => {
    const adapter = fakeAdapter(
      { light: [{ pos: 'noun', senses: ['radiance'], source: 's' }] },
      ['glow', 'radiance'],
      ['dark'],
    );
    const r = analyzeLeximancy(adapter, 'light');
    expect(r.nearKin).toContain('glow');
    expect(r.counterfield).toContain('dark');
  });

  it('is unsupported when there is no content token', () => {
    const r = analyzeLeximancy(fakeAdapter({}), null);
    expect(r.status).toBe('unsupported');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-leximancy-adapter.test.js`
Expected: FAIL — cannot resolve `leximancy.adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/server/services/constellation/leximancy.adapter.js`:

```js
export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-1';

const MAX_SENSES = 5;

/** Rank-ordinal display confidence over Leximancy's returned sense order. */
function rankConfidence(index, total) {
  const raw = 1 / (index + 1);
  let sum = 0;
  for (let i = 0; i < total; i += 1) sum += 1 / (i + 1);
  return Number((raw / sum).toFixed(2));
}

/**
 * @param {object} lexiconAdapter
 * @param {string|null} contentToken
 */
export function analyzeLeximancy(lexiconAdapter, contentToken) {
  const empty = {
    status: 'unsupported',
    selectedInterpretationId: null,
    interpretations: [],
    nearKin: [],
    counterfield: [],
    warnings: [],
    anchor: contentToken,
  };
  if (!contentToken) return empty;

  const entries = (lexiconAdapter.lookupWord(contentToken, MAX_SENSES) || []).slice(0, MAX_SENSES);
  if (entries.length === 0) {
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  const interpretations = entries.map((entry, i) => ({
    id: `${contentToken}.${entry.pos || 'x'}.${i}`,
    gloss: lexiconAdapter.extractGloss(entry.senses) || String(entry.senses?.[0] ?? ''),
    confidence: rankConfidence(i, entries.length),
    pos: entry.pos || '',
  }));

  const nearKin = (lexiconAdapter.lookupSynonyms?.(contentToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(contentToken, 20) || []).map((e) => e.lemma);

  let status;
  let selectedInterpretationId;
  const warnings = [];
  if (entries.length === 1) {
    status = 'resolved';
    selectedInterpretationId = interpretations[0].id;
  } else if (interpretations[0].pos !== interpretations[1].pos) {
    status = 'ambiguous';
    selectedInterpretationId = null;
    warnings.push('Top senses span different parts of speech — ambiguity is data');
  } else {
    status = 'resolved';
    selectedInterpretationId = interpretations[0].id;
  }

  return { status, selectedInterpretationId, interpretations, nearKin, counterfield, warnings, anchor: contentToken };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-leximancy-adapter.test.js`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellation/leximancy.adapter.js \
  tests/qa/features/constellation-leximancy-adapter.test.js
git commit -m "feat(constellation): leximancy adapter with POS-divergence refusal"
```

---

### Task 4: Rhyme Astrology adapter

**Files:**
- Create: `codex/server/services/constellation/rhymeAstrology.adapter.js`
- Test: `tests/qa/features/constellation-rhyme-adapter.test.js`

**Interfaces:**
- Consumes: injected `rhymeQueryEngine` with `async query({ text, mode }) → { topMatches: Array<{ token, overallScore }>, constellations: Array<{ dominantVowelFamily: string[], dominantStressPattern: string, members: string[], cohesionScore, densityScore }>, diagnostics }`; injected `rhymeLexiconRepo` with `lookupNodeByNormalized(token) → { phonemes: string[] } | null`. `resolveQueryIdentity` output.
- Produces:
  - `RHYME_ADAPTER_VERSION: 'ra-adapter-1'`
  - `async analyzeRhyme(rhymeQueryEngine, rhymeLexiconRepo, identity): { phonemes, stress, cadenceFamily, exactRhymes, slantRhymes, dominantVowelFamily, engineVersion } | null`
  - `cadenceFamilyFromStress(stress: string): string`

**Mapping:** RA mode = `word` when `identity.kind === 'word'` else `line`. `phonemes` from `rhymeLexiconRepo.lookupNodeByNormalized(primaryContentToken)?.phonemes` (backend truth; `[]` if absent). `stress = constellations[0].dominantStressPattern`. `dominantVowelFamily = constellations[0].dominantVowelFamily[0]`. `exactRhymes` = first constellation's `members`; `slantRhymes` = `topMatches` tokens not already exact. Returns `null` only if the engine throws (caught by the service).

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-rhyme-adapter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { analyzeRhyme, cadenceFamilyFromStress } from '../../../codex/server/services/constellation/rhymeAstrology.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

const engine = {
  async query({ mode }) {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }, { token: 'warning', overallScore: 0.6 }],
      constellations: [{
        dominantVowelFamily: ['AO'],
        dominantStressPattern: 'x / x',
        members: ['mooring', 'warning'],
        cohesionScore: 0.5,
        densityScore: 0.4,
      }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 2 },
      _mode: mode,
    };
  },
};
const repo = { lookupNodeByNormalized: (t) => (t === 'morning' ? { phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] } : null) };

describe('analyzeRhyme', () => {
  it('maps engine output to panel fields with backend phonemes', async () => {
    const id = resolveQueryIdentity('the bright wound of morning');
    const r = await analyzeRhyme(engine, repo, id);
    expect(r.phonemes).toEqual(['M', 'AO1', 'R', 'N', 'IH0', 'NG']);
    expect(r.stress).toBe('x / x');
    expect(r.dominantVowelFamily).toBe('AO');
    expect(r.exactRhymes).toEqual(['mooring', 'warning']);
    expect(r.slantRhymes).toContain('mourning');
  });

  it('derives a cadence family label from the stress contour', () => {
    expect(cadenceFamilyFromStress('x / x /')).toBe('iambic-adjacent');
    expect(cadenceFamilyFromStress('/ x / x')).toBe('trochaic-adjacent');
    expect(cadenceFamilyFromStress('')).toBe('unmetered');
  });

  it('returns empty phonemes (not fabricated) when the repo has no node', async () => {
    const id = resolveQueryIdentity('zzzq');
    const r = await analyzeRhyme(engine, { lookupNodeByNormalized: () => null }, id);
    expect(r.phonemes).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-rhyme-adapter.test.js`
Expected: FAIL — cannot resolve `rhymeAstrology.adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/server/services/constellation/rhymeAstrology.adapter.js`:

```js
export const RHYME_ADAPTER_VERSION = 'ra-adapter-1';

/** Label the cadence from the stress contour's leading beat. Structural, deterministic. */
export function cadenceFamilyFromStress(stress) {
  const marks = String(stress || '').replace(/\s+/g, '');
  if (!marks) return 'unmetered';
  if (marks.startsWith('x/')) return 'iambic-adjacent';
  if (marks.startsWith('/x')) return 'trochaic-adjacent';
  return 'mixed-cadence';
}

/**
 * @param {object} rhymeQueryEngine
 * @param {object} rhymeLexiconRepo
 * @param {object} identity  resolveQueryIdentity output
 */
export async function analyzeRhyme(rhymeQueryEngine, rhymeLexiconRepo, identity) {
  const mode = identity.kind === 'word' ? 'word' : 'line';
  const result = await rhymeQueryEngine.query({ text: identity.normalized, mode });

  const constellation = (result.constellations && result.constellations[0]) || null;
  const stress = constellation?.dominantStressPattern || '';
  const dominantVowelFamily = constellation?.dominantVowelFamily?.[0] || null;
  const exactRhymes = constellation ? [...constellation.members] : [];
  const exactSet = new Set(exactRhymes);
  const slantRhymes = (result.topMatches || [])
    .map((m) => m.token)
    .filter((t) => !exactSet.has(t));

  const anchor = identity.primaryContentToken || identity.tokens[identity.tokens.length - 1] || identity.normalized;
  const node = rhymeLexiconRepo.lookupNodeByNormalized(anchor);
  const phonemes = Array.isArray(node?.phonemes) ? node.phonemes : [];

  return {
    phonemes,
    stress,
    cadenceFamily: cadenceFamilyFromStress(stress),
    exactRhymes,
    slantRhymes,
    dominantVowelFamily,
    engineVersion: RHYME_ADAPTER_VERSION,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-rhyme-adapter.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellation/rhymeAstrology.adapter.js \
  tests/qa/features/constellation-rhyme-adapter.test.js
git commit -m "feat(constellation): rhyme astrology adapter (backend phonemes only)"
```

---

### Task 5: Phrase Genome adapter

**Files:**
- Create: `codex/server/services/constellation/genome.adapter.js`
- Test: `tests/qa/features/constellation-genome-adapter.test.js`

**Interfaces:**
- Consumes: the rhyme channel output from Task 4 (`{ phonemes, dominantVowelFamily }`), `identity.tokens`, and `VOWEL_FAMILY_TO_SCHOOL` from `codex/core/constants/schools.js`.
- Produces:
  - `GENOME_ADAPTER_VERSION: 'genome-adapter-1'`
  - `analyzeGenome(rhyme: object|null, identity: object): { syllables, devicesHint, schoolHint }`
  - `syllablesFromPhonemes(phonemes: string[]): number`

**Rules:** `syllables` = count of ARPABET vowel phonemes (those ending in a stress digit `0|1|2`) — counting backend phonemes, not classifying them. `schoolHint = VOWEL_FAMILY_TO_SCHOOL[rhyme.dominantVowelFamily] ?? null` — **backend vowel-family index → school, never client-recomputed** (gene directive). `devicesHint` = `['alliteration-candidate']` when ≥2 content tokens share a first letter, else `[]` (structural, measurable; semantic devices deferred to the Observatory).

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-genome-adapter.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { analyzeGenome, syllablesFromPhonemes } from '../../../codex/server/services/constellation/genome.adapter.js';
import { resolveQueryIdentity } from '../../../codex/core/constellation/queryIdentity.js';

describe('analyzeGenome', () => {
  it('counts syllables from ARPABET vowel phonemes', () => {
    expect(syllablesFromPhonemes(['M', 'AO1', 'R', 'N', 'IH0', 'NG'])).toBe(2);
    expect(syllablesFromPhonemes([])).toBe(0);
  });

  it('maps the backend dominant vowel family to a school', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'], dominantVowelFamily: 'IY' }, id);
    expect(g.schoolHint).toBe('PSYCHIC'); // IY → PSYCHIC per schools.js
    expect(g.syllables).toBe(2);
  });

  it('flags alliteration when content tokens share a first letter', () => {
    const id = resolveQueryIdentity('silent silver sea');
    const g = analyzeGenome({ phonemes: [], dominantVowelFamily: null }, id);
    expect(g.devicesHint).toContain('alliteration-candidate');
  });

  it('returns a null school when there is no vowel family', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome({ phonemes: [], dominantVowelFamily: null }, id);
    expect(g.schoolHint).toBeNull();
    expect(g.devicesHint).toEqual([]);
  });

  it('is inert when the rhyme channel is null', () => {
    const id = resolveQueryIdentity('morning');
    const g = analyzeGenome(null, id);
    expect(g.syllables).toBe(0);
    expect(g.schoolHint).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-genome-adapter.test.js`
Expected: FAIL — cannot resolve `genome.adapter.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/server/services/constellation/genome.adapter.js`:

```js
import { VOWEL_FAMILY_TO_SCHOOL } from '../../../core/constants/schools.js';
import { STOPWORDS } from '../../../core/constellation/stopwords.js';

export const GENOME_ADAPTER_VERSION = 'genome-adapter-1';

/** ARPABET vowels carry a stress digit (0|1|2); one per syllable. */
export function syllablesFromPhonemes(phonemes) {
  if (!Array.isArray(phonemes)) return 0;
  return phonemes.filter((p) => /[0-2]$/.test(String(p))).length;
}

function alliterationHint(tokens) {
  const content = tokens.filter((t) => !STOPWORDS.has(t) && t.length > 0);
  const firsts = content.map((t) => t[0]);
  const hasRepeat = firsts.some((c, i) => firsts.indexOf(c) !== i);
  return hasRepeat ? ['alliteration-candidate'] : [];
}

/**
 * @param {{ phonemes: string[], dominantVowelFamily: string|null }|null} rhyme
 * @param {object} identity  resolveQueryIdentity output
 */
export function analyzeGenome(rhyme, identity) {
  const phonemes = rhyme?.phonemes || [];
  const family = rhyme?.dominantVowelFamily || null;
  return {
    syllables: syllablesFromPhonemes(phonemes),
    devicesHint: alliterationHint(identity.tokens || []),
    schoolHint: (family && VOWEL_FAMILY_TO_SCHOOL[family]) || null,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-genome-adapter.test.js`
Expected: PASS (5 tests). If the `IY → PSYCHIC` assertion fails, open `codex/core/constants/schools.js`, read the real `VOWEL_FAMILY_TO_SCHOOL` mapping, and correct the expected school in the test to match the source of truth (do not change the adapter).

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellation/genome.adapter.js \
  tests/qa/features/constellation-genome-adapter.test.js
git commit -m "feat(constellation): phrase genome from backend vowel-family + phonemes"
```

---

### Task 6: Page composition service

**Files:**
- Create: `codex/server/services/constellationPage.service.js`
- Test: `tests/qa/features/constellationPage.service.test.js`

**Interfaces:**
- Consumes: `resolveQueryIdentity`, `computePageBytecode`, `analyzeLeximancy`, `analyzeRhyme`, `analyzeGenome`, and adapter versions. Dependencies injected as `{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }`.
- Produces:
  - `async buildConstellationPage(rawQuery: string, deps): ConstellationPhase1Packet`
  - Each channel wrapped so a throw lists the channel in `diagnostics.degradedChannels` and yields a safe empty result (§7.8).

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellationPage.service.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { buildConstellationPage } from '../../../codex/server/services/constellationPage.service.js';

const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning' ? [{ pos: 'noun', senses: ['dawn'], source: 's' }] : []),
  extractGloss: (s) => s?.[0] || null,
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
};
const rhymeQueryEngine = {
  async query() {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }],
      constellations: [{ dominantVowelFamily: ['AO'], dominantStressPattern: 'x /', members: ['warning'], cohesionScore: 0.5, densityScore: 0.4 }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 1 },
    };
  },
};
const rhymeLexiconRepo = { lookupNodeByNormalized: () => ({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] }) };
const deps = { lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo };

describe('buildConstellationPage', () => {
  it('composes all channels for a known phrase', async () => {
    const p = await buildConstellationPage('the bright wound of morning', deps);
    expect(p.schema_id).toBe('scholomance/constellation-os-page-phase1');
    expect(p.query.kind).toBe('phrase');
    expect(p.leximancy.status).toBe('resolved');
    expect(p.rhymeAstrology.phonemes.length).toBeGreaterThan(0);
    expect(p.phraseGenome.syllables).toBe(2);
    expect(p.pageBytecode).toMatch(/^COS-PAGE-v1-/);
    expect(p.diagnostics.degradedChannels).toEqual([]);
  });

  it('degrades only the rhyme channel when its engine throws', async () => {
    const brokenDeps = { ...deps, rhymeQueryEngine: { async query() { throw new Error('index offline'); } } };
    const p = await buildConstellationPage('morning', brokenDeps);
    expect(p.rhymeAstrology).toBeNull();
    expect(p.diagnostics.degradedChannels).toContain('rhymeAstrology');
    expect(p.leximancy.status).toBe('resolved'); // other channels intact
  });

  it('is deterministic in bytecode for the same query', async () => {
    const a = await buildConstellationPage('morning', deps);
    const b = await buildConstellationPage('morning', deps);
    expect(a.pageBytecode).toBe(b.pageBytecode);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellationPage.service.test.js`
Expected: FAIL — cannot resolve `constellationPage.service.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/server/services/constellationPage.service.js`:

```js
import { resolveQueryIdentity } from '../../core/constellation/queryIdentity.js';
import { computePageBytecode } from '../../core/constellation/pageBytecode.js';
import { analyzeLeximancy, LEXIMANCY_ADAPTER_VERSION } from './constellation/leximancy.adapter.js';
import { analyzeRhyme, RHYME_ADAPTER_VERSION } from './constellation/rhymeAstrology.adapter.js';
import { analyzeGenome, GENOME_ADAPTER_VERSION } from './constellation/genome.adapter.js';

const CONSTELLATION_OS_VERSION = 'phase1-live-1';

function emptyLeximancy() {
  return { status: 'unsupported', selectedInterpretationId: null, interpretations: [], nearKin: [], counterfield: [], warnings: [], anchor: null };
}

/**
 * @param {string} rawQuery
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }} deps
 * @returns {Promise<import('../../../src/pages/Constellation/types.js').ConstellationPhase1Packet>}
 */
export async function buildConstellationPage(rawQuery, deps) {
  const identity = resolveQueryIdentity(rawQuery);
  const degradedChannels = [];
  const warnings = [];

  let leximancy = emptyLeximancy();
  try {
    leximancy = analyzeLeximancy(deps.lexiconAdapter, identity.primaryContentToken);
  } catch (err) {
    degradedChannels.push('leximancy');
    warnings.push(`leximancy channel failed: ${err.message}`);
  }

  let rhyme = null;
  try {
    rhyme = await analyzeRhyme(deps.rhymeQueryEngine, deps.rhymeLexiconRepo, identity);
  } catch (err) {
    degradedChannels.push('rhymeAstrology');
    warnings.push(`rhymeAstrology channel failed: ${err.message}`);
  }

  let genome = { syllables: 0, devicesHint: [], schoolHint: null };
  try {
    genome = analyzeGenome(rhyme, identity);
  } catch (err) {
    degradedChannels.push('phraseGenome');
    warnings.push(`phraseGenome channel failed: ${err.message}`);
  }

  const engineVersions = {
    constellationOS: CONSTELLATION_OS_VERSION,
    leximancy: LEXIMANCY_ADAPTER_VERSION,
    rhymeAstrology: RHYME_ADAPTER_VERSION,
    phraseGenome: GENOME_ADAPTER_VERSION,
  };

  const pageBytecode = computePageBytecode({
    normalized: identity.normalized,
    kind: identity.kind,
    engineVersions,
  });

  return {
    version: 1,
    schema_id: 'scholomance/constellation-os-page-phase1',
    pageBytecode,
    query: {
      raw: identity.raw,
      normalized: identity.normalized,
      kind: identity.kind,
      tokenCount: identity.tokenCount,
      graphemeCount: identity.graphemeCount,
    },
    leximancy: {
      status: leximancy.status,
      selectedInterpretationId: leximancy.selectedInterpretationId,
      interpretations: leximancy.interpretations,
      warnings: leximancy.warnings,
      nearKin: leximancy.nearKin,
      counterfield: leximancy.counterfield,
    },
    rhymeAstrology: rhyme
      ? {
          phonemes: rhyme.phonemes,
          stress: rhyme.stress,
          cadenceFamily: rhyme.cadenceFamily,
          exactRhymes: rhyme.exactRhymes,
          slantRhymes: rhyme.slantRhymes,
        }
      : null,
    phraseGenome: {
      syllables: genome.syllables,
      devicesHint: genome.devicesHint,
      schoolHint: genome.schoolHint,
    },
    diagnostics: { degradedChannels, warnings },
    provenance: { engineVersions },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellationPage.service.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellationPage.service.js \
  tests/qa/features/constellationPage.service.test.js
git commit -m "feat(constellation): page composition service with local degradation"
```

---

### Task 7: HTTP route + server wiring

**Files:**
- Create: `codex/server/routes/constellation.routes.js`
- Modify: `codex/server/index.js` (register the route with shared singletons)
- Test: `tests/server/constellationPage.routes.test.js`

**Interfaces:**
- Consumes: `buildConstellationPage`, and injected `{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }`.
- Produces: `constellationRoutes(fastify, opts)` registering `GET /api/constellation/page`. Query validation: `query` required, ≤ 600 graphemes, reject control chars → 400. On success returns the packet JSON.

**Validation rule:** reject when `query` is missing/empty, when `[...query].length > 600`, or when `/[\u0000-\u0008\u000E-\u001F]/.test(query)` (control chars, §21.7). Return `reply.status(400).send({ error })`.

- [ ] **Step 1: Write the failing test**

Create `tests/server/constellationPage.routes.test.js`:

```js
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Fastify from 'fastify';
import { constellationRoutes } from '../../codex/server/routes/constellation.routes.js';

const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning' ? [{ pos: 'noun', senses: ['dawn'], source: 's' }] : []),
  extractGloss: (s) => s?.[0] || null,
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
};
const rhymeQueryEngine = {
  async query() {
    return {
      topMatches: [{ token: 'mourning', overallScore: 0.7 }],
      constellations: [{ dominantVowelFamily: ['AO'], dominantStressPattern: 'x /', members: ['warning'], cohesionScore: 0.5, densityScore: 0.4 }],
      diagnostics: { queryTimeMs: 1, cacheHit: false, candidateCount: 1 },
    };
  },
};
const rhymeLexiconRepo = { lookupNodeByNormalized: () => ({ phonemes: ['M', 'AO1', 'R', 'N', 'IH0', 'NG'] }) };

async function buildApp() {
  const app = Fastify();
  await app.register(constellationRoutes, { lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo });
  await app.ready();
  return app;
}

describe('GET /api/constellation/page', () => {
  let app;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns a packet for a valid query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/page?query=morning' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.schema_id).toBe('scholomance/constellation-os-page-phase1');
    expect(body.rhymeAstrology.phonemes.length).toBeGreaterThan(0);
    expect(body.phraseGenome.syllables).toBe(2);
  });

  it('rejects an empty query', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/constellation/page?query=' });
    expect(res.statusCode).toBe(400);
  });

  it('rejects an oversize query', async () => {
    const long = 'a'.repeat(601);
    const res = await app.inject({ method: 'GET', url: `/api/constellation/page?query=${long}` });
    expect(res.statusCode).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/constellationPage.routes.test.js`
Expected: FAIL — cannot resolve `constellation.routes.js`

- [ ] **Step 3: Write minimal implementation**

Create `codex/server/routes/constellation.routes.js`:

```js
import { buildConstellationPage } from '../services/constellationPage.service.js';

const MAX_QUERY_GRAPHEMES = 600;
const CONTROL_CHARS = /[\u0000-\u0008\u000E-\u001F]/;

/**
 * @param {import('fastify').FastifyInstance} fastify
 * @param {{ lexiconAdapter, rhymeQueryEngine, rhymeLexiconRepo }} opts
 */
export async function constellationRoutes(fastify, opts) {
  const deps = {
    lexiconAdapter: opts.lexiconAdapter,
    rhymeQueryEngine: opts.rhymeQueryEngine,
    rhymeLexiconRepo: opts.rhymeLexiconRepo,
  };

  fastify.get('/api/constellation/page', {
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
    handler: async (request, reply) => {
      const query = typeof request.query?.query === 'string' ? request.query.query : '';
      const trimmed = query.trim();
      if (!trimmed) {
        return reply.status(400).send({ error: 'query is required' });
      }
      if ([...query].length > MAX_QUERY_GRAPHEMES) {
        return reply.status(400).send({ error: 'query too long' });
      }
      if (CONTROL_CHARS.test(query)) {
        return reply.status(400).send({ error: 'query contains control characters' });
      }
      try {
        const packet = await buildConstellationPage(query, deps);
        return packet;
      } catch (error) {
        fastify.log?.error?.({ err: error }, '[ConstellationRoute] page build failed');
        return reply.status(500).send({ error: 'constellation page build failed' });
      }
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/constellationPage.routes.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire into the server**

In `codex/server/index.js`, near the other lexicon/rhyme route registrations (search for `fastify.register(lexiconRoutes` and `rhymeAstrologyRoutes`), add the import at the top with the other route imports:

```js
import { constellationRoutes } from './routes/constellation.routes.js';
```

Then register it after the rhyme-astrology and lexicon singletons are available. The RA route builds its engine + repos internally; to share them, build them once at the app scope the same way `rhymeAstrology.routes.js` does and pass both routes the same instances. Concretely, where `lexiconAdapter` and the rhyme artifacts are resolved, add:

```js
import { createRhymeAstrologyLexiconRepo } from '../services/rhyme-astrology/lexiconRepo.js';
import { createRhymeAstrologyIndexRepo } from '../services/rhyme-astrology/indexRepo.js';
import { createRhymeAstrologyQueryEngine } from '../runtime/rhyme-astrology/queryEngine.js';
import { resolveRhymeAstrologyArtifactPaths } from '../routes/rhymeAstrology.routes.js'; // if exported; otherwise replicate path resolution

// build shared RA singletons (guarded so failure does not crash boot):
let sharedRhymeQueryEngine = null;
let sharedRhymeLexiconRepo = null;
try {
  const artifactPaths = resolveRhymeAstrologyArtifactPaths({});
  sharedRhymeLexiconRepo = createRhymeAstrologyLexiconRepo(artifactPaths.lexiconDbPath, { log: fastify.log });
  const indexRepo = createRhymeAstrologyIndexRepo({
    indexDbPath: artifactPaths.indexDbPath,
    edgesDbPath: artifactPaths.edgesDbPath,
    log: fastify.log,
  });
  sharedRhymeQueryEngine = createRhymeAstrologyQueryEngine({ lexiconRepo: sharedRhymeLexiconRepo, indexRepo, log: fastify.log });
} catch (err) {
  fastify.log.warn({ err }, '[Constellation] rhyme singletons unavailable; rhyme channel will degrade');
}

fastify.register(constellationRoutes, {
  lexiconAdapter,
  rhymeQueryEngine: sharedRhymeQueryEngine,
  rhymeLexiconRepo: sharedRhymeLexiconRepo,
});
```

If `resolveRhymeAstrologyArtifactPaths` is not exported from `rhymeAstrology.routes.js`, export it there (add `export` to its declaration) so both routes resolve artifacts identically — do not duplicate the path logic. If `sharedRhymeQueryEngine` is `null`, the service's try/catch already degrades the rhyme channel (a `null` engine throws on `.query`, which is caught). Confirm boot with:

Run: `node -e "import('./codex/server/routes/constellation.routes.js').then(()=>console.log('route import ok'))"`
Expected: `route import ok`

- [ ] **Step 6: Commit**

```bash
git add codex/server/routes/constellation.routes.js codex/server/index.js \
  tests/server/constellationPage.routes.test.js
git commit -m "feat(constellation): GET /api/constellation/page route + server wiring"
```

---

### Task 8: Client fetch on submit + fixture fallback

**Files:**
- Modify: `src/hooks/useConstellationPage.js`
- Test: `tests/qa/features/useConstellationPage.test.js` (extend existing)

**Interfaces:**
- Consumes: `GET /api/constellation/page?query=…`; `resolveConstellationFixture` (existing) as the failure fallback.
- Produces: `useConstellationPage(query: string|null): { status: 'idle'|'loading'|'ready', packet: ConstellationPhase1Packet|null }`. Fetches on non-null query with an `AbortController`; maps JSON to the packet; on fetch error or non-2xx falls back to `resolveConstellationFixture(query)`.

- [ ] **Step 1: Write the failing test (extend the existing file)**

Add to `tests/qa/features/useConstellationPage.test.js`:

```js
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, vi } from 'vitest';

describe('useConstellationPage live fetch', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it('returns the server packet on success', async () => {
    const serverPacket = {
      version: 1,
      schema_id: 'scholomance/constellation-os-page-phase1',
      pageBytecode: 'COS-PAGE-v1-DEADBEEF',
      query: { raw: 'morning', normalized: 'morning', kind: 'word', tokenCount: 1, graphemeCount: 7 },
      leximancy: { status: 'resolved', selectedInterpretationId: 'morning.noun.0', interpretations: [{ id: 'morning.noun.0', gloss: 'dawn', confidence: 1 }], warnings: [] },
      rhymeAstrology: { phonemes: ['M', 'AO1'], stress: 'x /', cadenceFamily: 'iambic-adjacent', exactRhymes: ['warning'], slantRhymes: ['mourning'] },
      phraseGenome: { syllables: 2, devicesHint: [], schoolHint: 'PSYCHIC' },
      diagnostics: { degradedChannels: [], warnings: [] },
      provenance: { engineVersions: {} },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => serverPacket })));
    const { result } = renderHook(() => useConstellationPage('morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe('COS-PAGE-v1-DEADBEEF');
  });

  it('falls back to the fixture when the server errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500, json: async () => ({}) })));
    const { result } = renderHook(() => useConstellationPage('the bright wound of morning'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
  });

  it('falls back to the fixture when fetch rejects (offline)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    const { result } = renderHook(() => useConstellationPage('gravity'));
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.packet.query.raw).toBe('gravity');
  });
});
```

(The existing top-of-file imports already bring in `renderHook`, `useConstellationPage`, and `SAMPLE_BRIGHT_WOUND_PACKET`; add `waitFor` to the `@testing-library/react` import and `vi`, `afterEach` to the vitest import if not present.)

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/useConstellationPage.test.js`
Expected: FAIL — hook is synchronous/fixture-only, never `loading`, `fetch` not called

- [ ] **Step 3: Write minimal implementation**

Replace `src/hooks/useConstellationPage.js`:

```js
import { useEffect, useRef, useState } from 'react';
import { resolveConstellationFixture } from '../pages/Constellation/fixtures/samplePagePacket.js';

/**
 * Fetches a live ConstellationOS page on submit; falls back to the deterministic
 * fixture when the backend is unavailable (PDR §7.8). Never recomputes engine
 * truth on the client — it maps the server packet verbatim.
 * @param {string | null} query
 * @returns {{ status: 'idle' | 'loading' | 'ready', packet: import('../pages/Constellation/types.js').ConstellationPhase1Packet | null }}
 */
export function useConstellationPage(query) {
  const [state, setState] = useState({ status: 'idle', packet: null });
  const requestId = useRef(0);

  useEffect(() => {
    if (query == null || String(query).trim() === '') {
      setState({ status: 'idle', packet: null });
      return undefined;
    }

    const id = requestId.current + 1;
    requestId.current = id;
    const controller = new AbortController();
    setState((prev) => ({ status: 'loading', packet: prev.packet }));

    (async () => {
      try {
        const res = await fetch(`/api/constellation/page?query=${encodeURIComponent(query)}`, {
          signal: controller.signal,
        });
        if (!res.ok) throw new Error(`status ${res.status}`);
        const packet = await res.json();
        if (requestId.current === id) setState({ status: 'ready', packet });
      } catch (err) {
        if (controller.signal.aborted) return;
        if (requestId.current === id) {
          setState({ status: 'ready', packet: resolveConstellationFixture(query) });
        }
      }
    })();

    return () => controller.abort();
  }, [query]);

  return state;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/qa/features/useConstellationPage.test.js`
Expected: PASS — including the original idle/fixture cases (fixture now reached via the fallback path)

Then run the full chamber suite to confirm no regressions:

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx tests/qa/features/constellation-routing.test.jsx`
Expected: PASS (the page test mocks reduced motion and submits; the hook's fetch rejects under jsdom with no server → fixture fallback keeps assertions valid). If any test asserted synchronous readiness, wrap the assertion in `await screen.findBy…` so it waits for the fallback resolve.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useConstellationPage.js tests/qa/features/useConstellationPage.test.js
git commit -m "feat(constellation): fetch live page on submit with fixture fallback"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| `GET /api/constellation/page` server route (§17.1) | 7 |
| queryIdentity (normalize/kind/counts, §10.2) | 1 |
| pageBytecode deterministic (§16) | 2 |
| Leximancy interpretations + near-kin + counterfield (§11) | 3 |
| §11.3 refusal (ambiguous → null selection) | 3, 6 |
| Rhyme Astrology phonemes/stress/cadence/rhymes (§12) | 4 |
| Phrase Genome syllables/devices/school | 5 |
| schoolHint from backend vowel-family (gene directive) | 5 |
| Local degradation / degradedChannels (§7.8) | 6 |
| Route validation / security (§21.7) | 7 |
| Client fetch on submit + fixture fallback | 8 |
| No client recomputation (gene directive) | 8 (maps verbatim) |
| Existing 14 chamber tests stay green | 8 |

## Placeholder scan

No TBD/TODO. Task 7 Step 5 names one conditional (export `resolveRhymeAstrologyArtifactPaths` if not already exported) with the exact action. Task 5 Step 4 names the one assertion to reconcile against `schools.js` truth.

## Type consistency

- `resolveQueryIdentity` output (`{ normalized, kind, tokens, primaryContentToken, ... }`) consumed identically in Tasks 3–6.
- `analyzeLeximancy` / `analyzeRhyme` / `analyzeGenome` return shapes match what `buildConstellationPage` reads in Task 6.
- Packet fields map 1:1 to `ConstellationPhase1Packet` and to the fields `ConstellationResultShell` already renders (`leximancy.interpretations[].{id,gloss,confidence}`, `rhymeAstrology.{phonemes,stress,cadenceFamily,exactRhymes,slantRhymes}`, `phraseGenome.{syllables,devicesHint,schoolHint}`). `nearKin`/`counterfield` are additive, ignored by the current shell.
