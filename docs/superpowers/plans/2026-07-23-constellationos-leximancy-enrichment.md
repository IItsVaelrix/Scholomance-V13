# ConstellationOS Leximancy Enrichment Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface five already-present lexicon fields (etymology, lexical rarity, WordNet broader/narrower/akin, sense examples, IPA) into the ConstellationOS result packet and panels, without new data acquisition.

**Architecture:** All entry-derived enrichment is produced inside `leximancy.adapter.js` (it already resolves the entries via `lookupWord`), so etymology + IPA + rarity + relations all descend from *one* selected entry. `buildConstellationPage` threads those onto the packet — `ipa` rides on `rhymeAstrology` (where it displays), the rest on `leximancy`. `ConstellationResultShell.jsx` renders them with strict hierarchy. Rarity is a pure `corpusFreqToRarity(freq)` function over a single versioned edges table.

**Tech Stack:** JavaScript (ESM), Vitest, React 18 + Testing Library, better-sqlite3 (adapter, not touched here).

## Global Constraints

- **Determinism (PDR §7.6):** same normalized query + same engine versions + same corpus checksum → byte-identical packet. All new lookups are deterministic DB reads; relation order is imposed by an explicit sort.
- **Local degradation (PDR §7.8):** a failed sub-lookup sets *only its own* field to empty/null and appends a **granular** `diagnostics.degradedChannels` entry (`leximancy.relations`, `leximancy.rarity`, `leximancy.etymology`, `rhyme.ipa`). The page never collapses.
- **Empty vs null is contractual:** present-but-empty array = "looked up, found nothing" (UI hides silently). `null` = "no value / degraded". Never conflated.
- **Caps:** `examples` ≤3 per interpretation, each ≤20 words; `relations.broader/narrower/akin` ≤10 each. Enriched packet stays within +15% of the Phase-1 baseline size.
- **Version bumps reflect what actually changed:** `LEXIMANCY_ADAPTER_VERSION` `lex-adapter-2` → `lex-adapter-3`; `CONSTELLATION_OS_VERSION` `phase1-live-1` → `phase1-live-2`. `RHYME_ADAPTER_VERSION` is **deliberately unchanged** (that adapter's logic did not change — IPA is leximancy-sourced and only *placed* on `rhymeAstrology` by the service). This intentionally supersedes spec §5's `ra-adapter-2`: the page still re-keys lawfully because `pageBytecode` hashes the whole `engineVersions` map and `leximancy` bumped. Do not read the unbumped rhyme version as an oversight. *(Confirmed sound by the final whole-branch review, 2026-07-23.)*
- **No mutation, XP, persistence, or engine/DB migration.** No `embeddings_tq`, no `lookupSymbolsLoose` this pass.
- **Spec:** `docs/superpowers/specs/2026-07-23-constellationos-leximancy-enrichment-design.md`.

---

### Task 1: Rarity banding pure function

**Files:**
- Create: `codex/core/constellation/rarity.js`
- Test: `tests/qa/features/constellation-rarity.test.js`

**Interfaces:**
- Produces: `corpusFreqToRarity(freq: number): { band: number, max: number, label: 'rare'|'uncommon'|'common' } | null` and `RARITY_EDGES: number[]` (the one versioned constant). `freq === 0` (or non-finite) → `null`.

- [ ] **Step 1: Write the failing test**

```js
// tests/qa/features/constellation-rarity.test.js
import { describe, it, expect } from 'vitest';
import { corpusFreqToRarity } from '../../../codex/core/constellation/rarity.js';

describe('corpusFreqToRarity', () => {
  it('returns null for an unattested / no-signal count', () => {
    expect(corpusFreqToRarity(0)).toBeNull();
    expect(corpusFreqToRarity(NaN)).toBeNull();
    expect(corpusFreqToRarity(-3)).toBeNull();
  });

  it('maps counts to bands 1..9 with a rare/uncommon/common label', () => {
    expect(corpusFreqToRarity(1)).toEqual({ band: 1, max: 9, label: 'rare' });
    expect(corpusFreqToRarity(39)).toEqual({ band: 3, max: 9, label: 'rare' });
    expect(corpusFreqToRarity(40)).toEqual({ band: 4, max: 9, label: 'uncommon' });
    expect(corpusFreqToRarity(399)).toEqual({ band: 5, max: 9, label: 'uncommon' });
    expect(corpusFreqToRarity(1200)).toEqual({ band: 7, max: 9, label: 'common' });
    expect(corpusFreqToRarity(19999)).toEqual({ band: 8, max: 9, label: 'common' });
    expect(corpusFreqToRarity(20000)).toEqual({ band: 9, max: 9, label: 'common' });
    expect(corpusFreqToRarity(1e9)).toEqual({ band: 9, max: 9, label: 'common' });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-rarity.test.js`
Expected: FAIL — cannot resolve `codex/core/constellation/rarity.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// codex/core/constellation/rarity.js
/**
 * Lexical-rarity banding over corpus sentence-frequency.
 *
 * `RARITY_EDGES` is the ONE versioned tunable (PDR §7). band = 1 + (edges passed),
 * so 8 edges yield bands 1..9. Calibrated provisionally for the ~115k-sentence
 * corpus; recalibrate against the PDR §21.2 difficult-word fixtures. A future
 * corpus-relative (percentile) rarity replaces the edges without a UI change.
 */
export const RARITY_EDGES = Object.freeze([4, 12, 40, 120, 400, 1200, 5000, 20000]);

const LABEL_FOR_BAND = (band) => (band <= 3 ? 'rare' : band <= 6 ? 'uncommon' : 'common');

/**
 * @param {number} freq raw corpus occurrence count (0 = no signal)
 * @returns {{ band: number, max: number, label: string } | null}
 */
export function corpusFreqToRarity(freq) {
  if (!Number.isFinite(freq) || freq <= 0) return null;
  let band = 1;
  for (const edge of RARITY_EDGES) if (freq >= edge) band += 1;
  return { band, max: RARITY_EDGES.length + 1, label: LABEL_FOR_BAND(band) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-rarity.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add codex/core/constellation/rarity.js tests/qa/features/constellation-rarity.test.js
git commit -m "feat(constellation): lexical-rarity banding pure function"
```

---

### Task 2: Enrich the Leximancy adapter

**Files:**
- Modify: `codex/server/services/constellation/leximancy.adapter.js`
- Test: `tests/qa/features/constellation-leximancy-adapter.test.js` (extend)

**Interfaces:**
- Consumes: `corpusFreqToRarity` from Task 1; lexicon adapter methods `lookupWord`, `extractGloss`, `lookupSynonyms`, `lookupAntonyms`, and (new) optional `lookupRelated`, `getCorpusFrequencies`.
- Produces: `analyzeLeximancy(lexiconAdapter, contentToken)` return object gains
  `etymology: string|null`, `ipa: string|null`, `rarity: {band,max,label}|null`,
  `relations: { broader: string[], narrower: string[], akin: string[] }`, and each
  `interpretations[i]` gains `examples: string[]`. `LEXIMANCY_ADAPTER_VERSION` → `'lex-adapter-3'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/qa/features/constellation-leximancy-adapter.test.js`. First extend the fake so it can carry the new data:

```js
// Replace the existing fakeAdapter helper with this richer version.
function fakeAdapter(entriesByWord, opts = {}) {
  const { syn = [], ant = [], related = null, freqs = null } = opts;
  return {
    lookupWord: (w) => entriesByWord[w] || [],
    // Real extractGloss takes a sense array; a sense may be a string or {gloss}.
    extractGloss: (senses) => {
      const s = senses && senses[0];
      return typeof s === 'string' ? s : (s && s.gloss) || null;
    },
    lookupSynonyms: () => syn.map((lemma) => ({ lemma })),
    lookupAntonyms: () => ant.map((lemma) => ({ lemma })),
    ...(related ? { lookupRelated: () => related } : {}),
    ...(freqs ? { getCorpusFrequencies: (words) => new Map(words.map((w) => [w, freqs[w] ?? 0])) } : {}),
  };
}
```

Then add these cases:

```js
it('pulls etymology and IPA from the SELECTED interpretation entry (homograph)', () => {
  // Two separate entries; sense arrays are single-sense so POS divergence => ambiguous.
  const adapter = fakeAdapter({
    wound: [
      { pos: 'noun', senses: ['injury / opening in flesh'], etymology: 'OE wund', pronunciation: '/wuːnd/' },
      { pos: 'verb', senses: ['past tense of wind'], etymology: 'OE windan', pronunciation: '/waʊnd/' },
    ],
  });
  const r = analyzeLeximancy(adapter, 'wound');
  expect(r.status).toBe('ambiguous');           // no selection
  expect(r.etymology).toBe('OE wund');          // falls back to the TOP entry
  expect(r.ipa).toBe('/wuːnd/');
});

it('binds etymology/IPA to the chosen entry when a sense is selected', () => {
  const adapter = fakeAdapter({
    gravity: [{ pos: 'noun', senses: ['a force'], etymology: 'L gravitas', pronunciation: '/ˈɡrævɪti/' }],
  });
  const r = analyzeLeximancy(adapter, 'gravity');
  expect(r.status).toBe('resolved');
  expect(r.etymology).toBe('L gravitas');
  expect(r.ipa).toBe('/ˈɡrævɪti/');
});

it('threads sense examples onto interpretations, capped at 3 and 20 words', () => {
  const long = Array.from({ length: 25 }, (_, i) => `w${i}`).join(' ');
  const adapter = fakeAdapter({
    river: [{
      pos: 'noun',
      senses: [{ gloss: 'a large stream', examples: ['the river ran high', 'they crossed the river', 'a river of light', long] }],
      etymology: 'OF rivere',
    }],
  });
  const r = analyzeLeximancy(adapter, 'river');
  expect(r.interpretations[0].examples).toHaveLength(3);           // capped at 3
  expect(r.interpretations[0].examples[0]).toBe('the river ran high');
});

it('returns sorted, capped relations (freq desc, then alphabetical)', () => {
  const adapter = fakeAdapter(
    { wound: [{ pos: 'noun', senses: ['injury'], etymology: 'x' }] },
    {
      related: {
        broader: [{ lemma: 'trauma' }, { lemma: 'injury' }],   // injury freq higher
        narrower: [{ lemma: 'gash' }, { lemma: 'cut' }],
        akin: [{ lemma: 'a' }, { lemma: 'b' }, { lemma: 'c' }, { lemma: 'd' }],
      },
      freqs: { injury: 900, trauma: 100, gash: 5, cut: 50 },
    },
  );
  const r = analyzeLeximancy(adapter, 'wound');
  expect(r.relations.broader).toEqual(['injury', 'trauma']);       // 900 > 100
  expect(r.relations.narrower).toEqual(['cut', 'gash']);           // 50 > 5
  expect(r.relations.akin.length).toBeLessThanOrEqual(10);
});

it('distinguishes empty relations (found nothing) from a missing method', () => {
  // No lookupRelated method at all -> empty arrays, no throw.
  const bare = fakeAdapter({ light: [{ pos: 'noun', senses: ['radiance'], etymology: 'x' }] });
  const r = analyzeLeximancy(bare, 'light');
  expect(r.relations).toEqual({ broader: [], narrower: [], akin: [] });
});

it('reports rarity from corpus frequency, null when no signal', () => {
  const withFreq = fakeAdapter({ owl: [{ pos: 'noun', senses: ['a bird'], etymology: 'x' }] }, { freqs: { owl: 45 } });
  expect(analyzeLeximancy(withFreq, 'owl').rarity).toEqual({ band: 4, max: 9, label: 'uncommon' });
  // getCorpusFrequencies returning an empty Map => null (no signal), not band 0.
  const noSignal = fakeAdapter({ owl: [{ pos: 'noun', senses: ['a bird'], etymology: 'x' }] });
  expect(analyzeLeximancy(noSignal, 'owl').rarity).toBeNull();
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/qa/features/constellation-leximancy-adapter.test.js`
Expected: the six new cases FAIL (`r.etymology` undefined, `examples` undefined, `relations` undefined, `rarity` undefined). The six original cases still PASS.

- [ ] **Step 3: Implement the enrichment**

Edit `codex/server/services/constellation/leximancy.adapter.js`. Bump the version, import the rarity fn, and rewrite `analyzeLeximancy`'s body to carry entry provenance + examples and to compute relations/rarity. Full file:

```js
import { corpusFreqToRarity } from '../../../core/constellation/rarity.js';

export const LEXIMANCY_ADAPTER_VERSION = 'lex-adapter-3';

const MAX_ENTRIES = 5;
/** Upper bound on rendered senses so a hyper-polysemous word does not flood the panel. */
const MAX_INTERPRETATIONS = 12;
const MAX_EXAMPLES = 3;
const MAX_EXAMPLE_WORDS = 20;
const MAX_RELATIONS = 10;

/** Rank-ordinal display confidence over Leximancy's returned sense order. */
function rankConfidence(index, total) {
  const raw = 1 / (index + 1);
  let sum = 0;
  for (let i = 0; i < total; i += 1) sum += 1 / (i + 1);
  return Number((raw / sum).toFixed(2));
}

/** Reuse Leximancy's own gloss extractor on a single sense (it takes a sense array). */
function senseGloss(lexiconAdapter, sense) {
  return (lexiconAdapter.extractGloss?.([sense]) || '').trim();
}

/** Sense may be a bare string or an object carrying an `examples` array. */
function senseExamples(sense) {
  const list = sense && typeof sense === 'object' && Array.isArray(sense.examples) ? sense.examples : [];
  return list
    .filter((e) => typeof e === 'string' && e.trim())
    .slice(0, MAX_EXAMPLES)
    .map((e) => {
      const words = e.trim().split(/\s+/);
      return words.length <= MAX_EXAMPLE_WORDS ? e.trim() : `${words.slice(0, MAX_EXAMPLE_WORDS).join(' ')}…`;
    });
}

/** Deterministic order for a relation bucket: corpus frequency desc, then alphabetical. */
function sortRelation(lemmas, freqMap) {
  return [...new Set(lemmas)]
    .sort((a, b) => (freqMap.get(b) || 0) - (freqMap.get(a) || 0) || a.localeCompare(b))
    .slice(0, MAX_RELATIONS);
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
    etymology: null,
    ipa: null,
    rarity: null,
    relations: { broader: [], narrower: [], akin: [] },
  };
  if (!contentToken) return empty;

  const entries = (lexiconAdapter.lookupWord(contentToken, MAX_ENTRIES) || []).slice(0, MAX_ENTRIES);
  if (entries.length === 0) {
    return { ...empty, warnings: [`No lexicon entry for "${contentToken}"`] };
  }

  // Flatten senses into interpretations, carrying each sense's ENTRY provenance
  // (etymology / pronunciation) so a homograph's origin follows the selected sense.
  const raw = [];
  for (const entry of entries) {
    const provenance = { etymology: entry.etymology ?? null, ipa: entry.pronunciation ?? null };
    const senses = Array.isArray(entry.senses) ? entry.senses : [];
    if (senses.length === 0) {
      raw.push({ gloss: '', pos: entry.pos || '', examples: [], ...provenance });
      continue;
    }
    for (const sense of senses) {
      const pos = (sense && typeof sense === 'object' && sense.pos) || entry.pos || '';
      raw.push({ gloss: senseGloss(lexiconAdapter, sense), pos, examples: senseExamples(sense), ...provenance });
    }
  }
  let kept = raw.filter((r) => r.gloss);
  if (kept.length === 0) kept = raw;
  kept = kept.slice(0, MAX_INTERPRETATIONS);

  const interpretations = kept.map((r, i) => ({
    id: `${contentToken}.${r.pos || 'x'}.${i}`,
    gloss: r.gloss,
    confidence: rankConfidence(i, kept.length),
    pos: r.pos,
    examples: r.examples,
  }));

  const nearKin = (lexiconAdapter.lookupSynonyms?.(contentToken, 20) || []).map((e) => e.lemma);
  const counterfield = (lexiconAdapter.lookupAntonyms?.(contentToken, 20) || []).map((e) => e.lemma);

  const related = lexiconAdapter.lookupRelated?.(contentToken, 20) || { broader: [], narrower: [], akin: [] };
  const relBroader = (related.broader || []).map((e) => e.lemma).filter(Boolean);
  const relNarrower = (related.narrower || []).map((e) => e.lemma).filter(Boolean);
  const relAkin = (related.akin || []).map((e) => e.lemma).filter(Boolean);

  // One batched frequency call powers both rarity (head word) and relation ordering.
  const freqWords = [contentToken, ...relBroader, ...relNarrower, ...relAkin];
  const freqMap = lexiconAdapter.getCorpusFrequencies?.(freqWords) || new Map();
  const rarity = freqMap.size > 0 ? corpusFreqToRarity(freqMap.get(contentToken) || 0) : null;

  const relations = {
    broader: sortRelation(relBroader, freqMap),
    narrower: sortRelation(relNarrower, freqMap),
    akin: sortRelation(relAkin, freqMap),
  };

  let status;
  let selectedIndex;
  const warnings = [];
  if (interpretations.length === 1) {
    status = 'resolved';
    selectedIndex = 0;
  } else if (interpretations[0].pos !== interpretations[1].pos) {
    status = 'ambiguous';
    selectedIndex = null;
    warnings.push('Top senses span different parts of speech — ambiguity is data');
  } else {
    status = 'resolved';
    selectedIndex = 0;
  }
  const selectedInterpretationId = selectedIndex === null ? null : interpretations[selectedIndex].id;

  // Etymology/IPA descend from the selected entry; when ambiguous, from the top entry.
  const originItem = kept[selectedIndex === null ? 0 : selectedIndex] || kept[0] || {};

  return {
    status,
    selectedInterpretationId,
    interpretations,
    nearKin,
    counterfield,
    warnings,
    anchor: contentToken,
    etymology: originItem.etymology ?? null,
    ipa: originItem.ipa ?? null,
    rarity,
    relations,
  };
}
```

- [ ] **Step 4: Run the full adapter test file**

Run: `npx vitest run tests/qa/features/constellation-leximancy-adapter.test.js`
Expected: PASS (all 12 — 6 original + 6 new).

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/constellation/leximancy.adapter.js tests/qa/features/constellation-leximancy-adapter.test.js
git commit -m "feat(constellation): etymology, IPA, rarity, relations, examples in leximancy adapter"
```

---

### Task 3: Thread enrichment through the page service + contract

**Files:**
- Modify: `codex/server/services/constellationPage.service.js:47-96`
- Modify: `src/pages/Constellation/types.js`
- Test: `tests/qa/features/constellationPage.service.test.js` (extend)

**Interfaces:**
- Consumes: enriched `analyzeLeximancy` result from Task 2 (`etymology`, `ipa`, `rarity`, `relations`, `interpretations[].examples`).
- Produces: `packet.leximancy` gains `etymology`, `rarity`, `relations`, and `examples` on each interpretation; `packet.rhymeAstrology.ipa`; granular `degradedChannels`; `CONSTELLATION_OS_VERSION` → `'phase1-live-2'`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/qa/features/constellationPage.service.test.js`. First enrich the shared `lexiconAdapter` fake at the top of the file so `morning` carries the new data:

```js
// Replace the existing lexiconAdapter const with this enriched version.
const lexiconAdapter = {
  lookupWord: (w) => (w === 'morning'
    ? [{ pos: 'noun', senses: [{ gloss: 'dawn', examples: ['early in the morning'] }], etymology: 'OE morgen', pronunciation: '/ˈmɔːnɪŋ/', source: 's' }]
    : []),
  extractGloss: (s) => { const x = s?.[0]; return typeof x === 'string' ? x : (x && x.gloss) || null; },
  lookupSynonyms: () => [{ lemma: 'dawn' }],
  lookupAntonyms: () => [{ lemma: 'dusk' }],
  lookupRelated: () => ({ broader: [{ lemma: 'time' }], narrower: [{ lemma: 'sunrise' }], akin: [{ lemma: 'daybreak' }] }),
  getCorpusFrequencies: (words) => new Map(words.map((w) => [w, w === 'morning' ? 300 : 10])),
};
```

Then add:

```js
it('threads etymology, rarity, relations, examples, and IPA onto the packet', async () => {
  const p = await buildConstellationPage('morning', deps);
  expect(p.leximancy.etymology).toBe('OE morgen');
  expect(p.leximancy.rarity).toEqual({ band: 5, max: 9, label: 'uncommon' });
  expect(p.leximancy.relations.broader).toEqual(['time']);
  expect(p.leximancy.interpretations[0].examples).toEqual(['early in the morning']);
  expect(p.rhymeAstrology.ipa).toBe('/ˈmɔːnɪŋ/');
});

it('records a granular degraded channel when relations lookup throws', async () => {
  const brokenLex = {
    ...lexiconAdapter,
    lookupRelated: () => { throw new Error('wordnet offline'); },
  };
  const p = await buildConstellationPage('morning', { ...deps, lexiconAdapter: brokenLex });
  expect(p.leximancy.relations).toEqual({ broader: [], narrower: [], akin: [] });
  expect(p.diagnostics.degradedChannels).toContain('leximancy.relations');
  expect(p.leximancy.etymology).toBe('OE morgen'); // other sub-fields intact
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `npx vitest run tests/qa/features/constellationPage.service.test.js`
Expected: the two new cases FAIL (`p.leximancy.etymology` undefined, `p.rhymeAstrology.ipa` undefined, no `leximancy.relations` degraded channel). Existing cases still PASS.

- [ ] **Step 3: Guard relations independently, then map the new fields**

The enrichment already lives in the adapter, but a throwing `lookupRelated` must degrade *only* relations. Wrap the relation part in the adapter's caller is not possible (adapter is one call), so guard at the service by re-deriving relations defensively is wrong (duplication). Instead, make the adapter's relation lookup itself non-fatal and let the service detect the empty-after-attempt case.

Simplest correct approach: in the adapter (Task 2 file), the `lookupRelated?.()` call already swallows a *missing* method, but a *throwing* method propagates. Wrap just that call:

```js
// In leximancy.adapter.js, replace the related line from Task 2 with a guarded read
// that records nothing itself but lets a thrown lookup fall back to empty:
let related = { broader: [], narrower: [], akin: [] };
let relationsFailed = false;
try {
  related = lexiconAdapter.lookupRelated?.(contentToken, 20) || related;
} catch {
  relationsFailed = true;
}
```

and add `relationsFailed` to the returned object:

```js
  return {
    status,
    selectedInterpretationId,
    interpretations,
    nearKin,
    counterfield,
    warnings,
    anchor: contentToken,
    etymology: originItem.etymology ?? null,
    ipa: originItem.ipa ?? null,
    rarity,
    relations,
    relationsFailed,
  };
```

Now edit `codex/server/services/constellationPage.service.js`. Bump the version constant and extend the packet mapping:

```js
const CONSTELLATION_OS_VERSION = 'phase1-live-2';
```

Replace the `leximancy: { ... }` packet block (currently lines ~71-78) with:

```js
    leximancy: {
      status: leximancy.status,
      selectedInterpretationId: leximancy.selectedInterpretationId,
      interpretations: leximancy.interpretations,
      warnings: leximancy.warnings,
      nearKin: leximancy.nearKin,
      counterfield: leximancy.counterfield,
      etymology: leximancy.etymology ?? null,
      rarity: leximancy.rarity ?? null,
      relations: leximancy.relations ?? { broader: [], narrower: [], akin: [] },
    },
```

Replace the `rhymeAstrology: rhyme ? { ... } : null` block (currently lines ~79-88) so `ipa` (sourced from the leximancy adapter's selected entry) rides on it:

```js
    rhymeAstrology: rhyme
      ? {
          phonemes: rhyme.phonemes,
          stress: rhyme.stress,
          cadenceFamily: rhyme.cadenceFamily,
          exactRhymes: rhyme.exactRhymes,
          slantRhymes: rhyme.slantRhymes,
          dominantVowelFamily: rhyme.dominantVowelFamily,
          ipa: leximancy.ipa ?? null,
        }
      : null,
```

Finally, after the leximancy `try/catch` (which pushes `'leximancy'` on total failure), add a granular note for a relations-only failure. Locate the existing leximancy try/catch (lines ~23-29) and add, immediately after it:

```js
  if (leximancy.relationsFailed) {
    degradedChannels.push('leximancy.relations');
    warnings.push('leximancy relations lookup failed');
  }
```

- [ ] **Step 4: Update the contract typedef**

Edit `src/pages/Constellation/types.js`. Replace the `leximancy` and `rhymeAstrology` `@property` lines with:

```js
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported', selectedInterpretationId: string|null, interpretations: Array<{ id: string, gloss: string, confidence: number, pos?: string, examples?: string[] }>, warnings: string[], nearKin?: string[], counterfield?: string[], etymology?: string|null, rarity?: { band: number, max: number, label: string }|null, relations?: { broader: string[], narrower: string[], akin: string[] } }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[], dominantVowelFamily?: string|null, ipa?: string|null } | null} rhymeAstrology
```

- [ ] **Step 5: Run the service test file + the adapter file (regression)**

Run: `npx vitest run tests/qa/features/constellationPage.service.test.js tests/qa/features/constellation-leximancy-adapter.test.js`
Expected: PASS (all cases in both files).

- [ ] **Step 6: Commit**

```bash
git add codex/server/services/constellationPage.service.js codex/server/services/constellation/leximancy.adapter.js src/pages/Constellation/types.js tests/qa/features/constellationPage.service.test.js
git commit -m "feat(constellation): thread enrichment onto packet, granular relations degradation"
```

---

### Task 4: Render enrichment in the result shell

**Files:**
- Modify: `src/pages/Constellation/ConstellationResultShell.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Test: `tests/qa/features/constellation-page.test.jsx` (extend)

**Interfaces:**
- Consumes: `packet.leximancy.{etymology, rarity, relations, interpretations[].examples}`, `packet.rhymeAstrology.ipa`.
- Produces: rendered etymology line (truncated), rarity pill, three differentiated relation chipsets, examples under the selected interpretation, an IPA row.

- [ ] **Step 1: Write the failing test**

The live page test falls back to the fixture (no server in jsdom), so drive rendering off an enriched fixture. Add to `tests/qa/features/constellation-page.test.jsx`:

```js
it('renders etymology, rarity, relations, examples, and IPA from the enriched fixture', async () => {
  render(
    <MemoryRouter>
      <ConstellationPage />
    </MemoryRouter>,
  );
  const field = screen.getByLabelText(/search the literary sky/i);
  fireEvent.change(field, { target: { value: 'the bright wound of morning' } });
  fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
  // Fixture (Task 5) carries the enrichment; assert each new surface renders.
  expect(await screen.findByText(/lexical relations/i)).toBeInTheDocument();
  // Glyphs live in nested aria-hidden spans, so match the label text, not "↑ broader".
  expect(screen.getByText(/broader/i)).toBeInTheDocument();
  expect(screen.getByText(/akin/i)).toBeInTheDocument();
  expect(screen.getByText(/\d\/9/)).toBeInTheDocument();            // rarity "n/9"
  expect(screen.getByText('IPA')).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`
Expected: the new case FAILS (no "lexical relations" / IPA text yet). Existing cases PASS.

- [ ] **Step 3: Implement rendering**

In `src/pages/Constellation/ConstellationResultShell.jsx`, add a truncation helper near the top (after the imports/`Chips` component):

```js
/** First sentence, ≤120 chars, ellipsis if trimmed. Render-side only (PDR §8). */
function truncateEtymology(text) {
  if (!text) return '';
  const firstSentence = String(text).split(/(?<=[.!?])\s/)[0];
  const clipped = firstSentence.length > 120 ? `${firstSentence.slice(0, 119)}…` : firstSentence;
  return clipped;
}

/** A labelled relation bucket with its own glyph; akin is capped with a +N affordance. */
function RelationChips({ glyph, label, items, cap }) {
  if (!items || items.length === 0) return null;
  const shown = cap ? items.slice(0, cap) : items;
  const extra = cap ? items.length - shown.length : 0;
  return (
    <div className="constellation-result-chipset">
      <span className="constellation-result-chipset__label">
        <span className="constellation-result-relglyph" aria-hidden="true">{glyph}</span> {label}{' '}
        <span className="constellation-result-chipset__count">{items.length}</span>
      </span>
      <ul className="constellation-result-chips constellation-result-chips--kin">
        {shown.map((item) => (
          <li key={item} className="constellation-result-chip">{item}</li>
        ))}
        {extra > 0 ? <li className="constellation-result-chip is-more">+{extra} more</li> : null}
      </ul>
    </div>
  );
}
```

Destructure the new fields — update the top of `ConstellationResultShell` where `leximancy` is read:

```js
  const relations = leximancy.relations ?? { broader: [], narrower: [], akin: [] };
  const rarity = leximancy.rarity ?? null;
  const etymology = leximancy.etymology ?? null;
  const selectedInterpretation =
    leximancy.interpretations.find((i) => i.id === leximancy.selectedInterpretationId) || null;
```

Inside the Leximancy `<section>`, immediately under the opening `<h2 id="cos-leximancy">…</h2>`, add the rarity pill + etymology line:

```jsx
        {rarity ? (
          <p className="constellation-result-rarity" aria-label={`Lexical rarity ${rarity.label}`}>
            {rarity.label} · {rarity.band}/{rarity.max}
          </p>
        ) : null}
        {etymology ? (
          <p className="constellation-result-etymology">
            <span className="constellation-result-etymology__label">Etymology</span>{' '}
            <span title={etymology}>{truncateEtymology(etymology)}</span>
          </p>
        ) : null}
```

After the existing `<Chips items={nearKin} …/>` and `<Chips items={counterfield} …/>` (inside the `hasLeximancy` branch), add the differentiated relations under a caption:

```jsx
            {(relations.broader.length || relations.narrower.length || relations.akin.length) ? (
              <div className="constellation-result-relations">
                <p className="constellation-result-relations__caption">lexical relations</p>
                <RelationChips glyph="↑" label="broader" items={relations.broader} />
                <RelationChips glyph="↓" label="narrower" items={relations.narrower} />
                <RelationChips glyph="≈" label="akin" items={relations.akin} cap={3} />
              </div>
            ) : null}
```

Still inside the `hasLeximancy` branch, after the interpretations `<ol>`, render examples for the selected interpretation:

```jsx
            {selectedInterpretation && selectedInterpretation.examples && selectedInterpretation.examples.length > 0 ? (
              <ul className="constellation-result-examples" aria-label="Example usage">
                {selectedInterpretation.examples.map((ex) => (
                  <li key={ex} className="constellation-result-example">“{ex}”</li>
                ))}
              </ul>
            ) : null}
```

In the Rhyme `<section>`, add an IPA row to the metrics `<table>` — immediately after the `Phonemes` `<tr>`:

```jsx
                {rhymeAstrology.ipa ? (
                  <tr>
                    <th scope="row">IPA</th>
                    <td className="constellation-result-ipa">{rhymeAstrology.ipa}</td>
                  </tr>
                ) : null}
```

- [ ] **Step 4: Add styles**

Append to `src/pages/Constellation/ConstellationPage.css`:

```css
.constellation-result-rarity {
  display: inline-block;
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--constellation-chrome, #cfc9ff);
  opacity: 0.85;
  margin: 0 0 0.4rem;
}
.constellation-result-etymology {
  font-size: 0.82rem;
  color: var(--constellation-chrome, #cfc9ff);
  opacity: 0.9;
  margin: 0 0 0.6rem;
}
.constellation-result-etymology__label {
  text-transform: uppercase;
  font-size: 0.66rem;
  letter-spacing: 0.08em;
  opacity: 0.65;
}
.constellation-result-relations {
  margin-top: 0.6rem;
}
.constellation-result-relations__caption {
  font-size: 0.66rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  opacity: 0.6;
  margin: 0 0 0.3rem;
}
.constellation-result-relglyph {
  opacity: 0.8;
}
.constellation-result-chip.is-more {
  opacity: 0.6;
  font-style: italic;
}
.constellation-result-examples {
  list-style: none;
  padding: 0;
  margin: 0.4rem 0 0;
}
.constellation-result-example {
  font-style: italic;
  opacity: 0.85;
  font-size: 0.85rem;
  margin: 0.15rem 0;
}
/* IPA needs a font with phonetic coverage so diacritics do not render as tofu. */
.constellation-result-ipa {
  font-family: "Charis SIL", "Gentium Plus", "Doulos SIL", "Noto Sans", serif;
}
```

- [ ] **Step 5: Run the page test**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`
Expected: PASS — but this depends on the enriched fixture from Task 5. If Task 5 is not yet done, the new case still fails on missing fixture data; do Task 5 then re-run. (Order: implement Task 5 before re-running Step 5.)

- [ ] **Step 6: Commit**

```bash
git add src/pages/Constellation/ConstellationResultShell.jsx src/pages/Constellation/ConstellationPage.css tests/qa/features/constellation-page.test.jsx
git commit -m "feat(constellation): render etymology, rarity, relations, examples, IPA in result shell"
```

---

### Task 5: Enrich the fixtures

**Files:**
- Modify: `src/pages/Constellation/fixtures/samplePagePacket.js`

**Interfaces:**
- Produces: `SAMPLE_BRIGHT_WOUND_PACKET` and `buildAwaitingPacket` carrying the new leximancy/rhyme fields, so the fixture-fallback path and the visual/page tests exercise the enriched shell.

- [ ] **Step 1: Add the new fields to the awaiting packet**

In `buildAwaitingPacket`, extend the `leximancy` object (add the three new keys) so the shape is complete even when awaiting:

```js
    leximancy: {
      status: 'unsupported',
      selectedInterpretationId: null,
      interpretations: [],
      warnings: ['Leximancy constellation_atlas not wired in v1'],
      nearKin: [],
      counterfield: [],
      etymology: null,
      rarity: null,
      relations: { broader: [], narrower: [], akin: [] },
    },
```

- [ ] **Step 2: Enrich the bright-wound fixture**

In `SAMPLE_BRIGHT_WOUND_PACKET.leximancy`, add examples to the selected-ish interpretation and the new fields. Replace the `interpretations` array and append the new keys:

```js
    interpretations: [
      { id: 'wound.injury', gloss: 'injury / opening in flesh', confidence: 0.52, pos: 'noun', examples: ['she bound the wound', 'a wound that would not close'] },
      { id: 'wound.past', gloss: 'past tense of wind', confidence: 0.41, pos: 'verb', examples: [] },
    ],
    warnings: ['Margin below selection threshold — ambiguity is data'],
    nearKin: ['gash', 'lesion', 'hurt'],
    counterfield: ['heal', 'mend'],
    etymology: 'Old English wund “hurt, injury”, from Proto-Germanic *wundō.',
    rarity: { band: 5, max: 9, label: 'uncommon' },
    relations: {
      broader: ['injury', 'trauma'],
      narrower: ['laceration', 'gash', 'gunshot'],
      akin: ['hurt', 'lesion', 'sore', 'cut'],
    },
```

Note: the bright-wound fixture is `ambiguous` (`selectedInterpretationId: null`), so the shell's example block (keyed to the *selected* interpretation) will not show examples here — that is correct behaviour. The relations/rarity/etymology blocks still render. The page test (Task 4 Step 1) asserts relations + rarity + IPA, which are present regardless of selection.

- [ ] **Step 3: Add IPA to the fixture's rhymeAstrology**

Find `SAMPLE_BRIGHT_WOUND_PACKET.rhymeAstrology` and add an `ipa` field:

```js
    ipa: '/ˈmɔːnɪŋ/',
```

- [ ] **Step 4: Run the page + visual tests**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`
Expected: PASS including the Task 4 enrichment case.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/fixtures/samplePagePacket.js
git commit -m "test(constellation): enrich fixtures with etymology, rarity, relations, examples, IPA"
```

---

### Task 6: Full-suite regression + intellisense self-check

**Files:** none (verification only).

- [ ] **Step 1: Run the whole constellation test set**

Run: `npx vitest run tests/qa/features/constellation-rarity.test.js tests/qa/features/constellation-leximancy-adapter.test.js tests/qa/features/constellationPage.service.test.js tests/qa/features/constellation-page.test.jsx tests/qa/features/constellation-rhyme-adapter.test.js tests/qa/features/constellation-genome-adapter.test.js`
Expected: PASS across all files.

- [ ] **Step 2: Run the visual chamber spec if the harness is available**

Run: `npx playwright test tests/visual/constellation-chamber.spec.js` (skip if no display/browser; note the skip).
Expected: PASS, or a clean documented skip.

- [ ] **Step 3: SCD64 fossil self-check (repo law)**

Run: `npm run scd64:intellisense`
Expected: no new fossils reported for the touched files.

- [ ] **Step 4: Commit any mechanical fixes** (only if Steps 1-3 surfaced them)

```bash
git add -A
git commit -m "chore(constellation): regression fixes from enrichment sweep"
```

---

## Self-Review

**1. Spec coverage** — spec §3 five enrichments: etymology (T2/T3/T4), rarity (T1/T2/T3/T4), relations broader/narrower/akin (T2/T3/T4), examples (T2/T3/T4), IPA (T2/T3/T4). §5 empty-vs-null contract → adapter empty arrays + null fields (T2), granular degradation (T3). §6.1 entry provenance + caps + sort → T2. §6.2 IPA one-coherent-entry → sourced from selected entry in adapter, placed by service (T3) — refined from "second lookup in service" to "no duplicate lookup", goal preserved. §7 rarity edges constant + freq===0→null → T1. §8 hierarchy/truncation/glyphs/akin-cap/caption/font → T4. §9 granular channels + size caps → T3 (+ caps enforced in T2). §10 tests: homograph (T2), boundary (T1), empty-vs-null (T2/T3), ordering (T2), determinism (existing service test still runs), degradation (T3), render (T4). All covered.

**2. Placeholder scan** — no TBD/TODO; every code step carries complete code.

**3. Type consistency** — `corpusFreqToRarity` signature identical across T1→T2. `relations: {broader,narrower,akin}` identical across T2/T3/T4/T5. `interpretations[].examples` identical across T2→T5. `rhymeAstrology.ipa` identical across T3/T4/T5. Version strings: `lex-adapter-3`, `phase1-live-2`, `RHYME_ADAPTER_VERSION` untouched — consistent with Global Constraints. `relationsFailed` introduced in T3 Step 3 and consumed in the same task.

**Note on Task ordering:** Task 4 Step 5 depends on Task 5's enriched fixture. Execute Task 5 before re-running Task 4's page test (called out inline in Task 4 Step 5).
