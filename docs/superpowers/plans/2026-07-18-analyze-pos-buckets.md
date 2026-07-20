# Analyze POS Category Buckets ("Leximancy") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Word results in the IDE Analyze panel get part-of-speech sub-buckets (Nouns / Verbs / Adjectives / Adverbs / Unclassified, alphabetized), and the feature's display name becomes "Leximancy".

**Architecture:** Server states POS facts — the lexicon adapter returns `pos` sets alongside lemmas and a new `batchLookupPos` classifies rhyme words; the Analyze service attaches normalized `pos: []` arrays to word items in the `related`, `oppositions`, `sound`, and `symbols` groups. The client (`AnalyzePanel`) partitions pos-carrying groups into buckets; groups without `pos` fields render unchanged. Spec: `docs/superpowers/specs/2026-07-18-analyze-pos-buckets-design.md`.

**Tech Stack:** Node ESM, better-sqlite3, Fastify routes, React 18 + PropTypes, vitest + @testing-library/react, Playwright (visual spec).

## Global Constraints

- POS canonical set is exactly `noun`, `verb`, `adjective`, `adverb` via `normalizeLemmaPos` from `codex/core/lexical-analysis/morphology.js`; it **throws** on unknown input, so always wrap in try/catch and drop failures (see `posMatches` in the service for the idiom).
- Non-word groups (`meaning`, `phrases`, `literary`, `corpus`) must NOT get a `pos` field — its absence is the client's do-not-bucket signal.
- Item ordering in the server contract is unchanged (rhymes stay corpus-frequency ordered); alphabetization happens client-side only.
- Code identifiers, file names, routes, and contract keys keep `analyze` naming; only user-facing copy says "Leximancy". Verb copy ("Analyzing…") stays.
- The service file's header law holds: deterministic, read-only composition. No wall-clock data, no randomness.
- Run tests with `npx vitest run <file>` from the repo root. The full-suite check at the end also runs `npm run scd64:intellisense` (project law: self-check diffs for SCD64 fossils before claiming done).
- Do not modify `src/pages/Read/ScrollEditor.jsx` (dead code) or `GrimDesignPanel.jsx` (different feature).

---

### Task 1: Adapter — POS facts on lemma lookups + `batchLookupPos`

**Files:**
- Modify: `codex/server/adapters/lexicon.sqlite.adapter.js` (SQL at lines ~263-293, `sanitizeLemmaRows` at ~556, `lookupRelated` ~502, `lookupSymbolsLoose` ~514, statement caches at ~124, return object ~580)
- Modify: `codex/server/services/world.service.js:50-55` (map new shape back to strings)
- Modify: `codex/server/routes/lexicon.routes.js:91-95` (map new shape back to strings)
- Modify: `tests/server/lexicon.routes.test.js:76-77` (mocks return new shape)
- Test: `tests/server/lexicon.sqlite.adapter.test.js`

**Interfaces:**
- Consumes: existing `wordnet_lemma(lemma, lemma_lower, synset_id, sense_rank, pos, …)` and `wordnet_rel` tables.
- Produces (Task 2 relies on these exact shapes):
  - `lookupSynonyms(word, limit)` → `[{ lemma: string, pos: string[] }]` (pos = raw DB values, deduped + sorted, possibly empty)
  - `lookupAntonyms(word, limit)` → same shape
  - `lookupRelated(word, limit)` → `{ broader: [{lemma, pos}], narrower: [{lemma, pos}], akin: [{lemma, pos}] }`
  - `lookupSymbolsLoose(word, limit)` → `[{ lemma, via: 'domain'|'exemplifies', pos: string[] }]`
  - `batchLookupPos(words)` → `{ [wordLower: string]: string[] }` (words with no WordNet row absent; empty input or no DB → `{}`)

- [ ] **Step 1: Write the failing tests**

In `tests/server/lexicon.sqlite.adapter.test.js`, first give the fixture a multi-POS lemma. In `createFixtureDb`, after line 118 (`lemmas.run('banality', …)`) add:

```js
  // arcana + mystery share a second, verb-POS synset so synonym results carry
  // a multi-POS set and batchLookupPos has a multi-POS word to classify.
  lemmas.run('arcana', 'arcana', 'syn.arcana2', 1, 'verb');
  lemmas.run('mystery', 'mystery', 'syn.arcana2', 1, 'verb');
```

Then add a new test after the `'supports lookup, rhyme, and batch operations against sqlite'` test (after line 311):

```js
  it('carries deduped POS sets on lemma lookups and classifies words in batch', () => {
    tempDir = mkdtempSync(path.join(os.tmpdir(), 'lexicon-adapter-'));
    const dbPath = path.join(tempDir, 'fixture.sqlite');
    createFixtureDb(dbPath);
    const adapter = createLexiconAdapter(dbPath);

    const synonyms = adapter.lookupSynonyms('arcana');
    expect(synonyms).toContainEqual({ lemma: 'mystery', pos: ['noun', 'verb'] });
    expect(synonyms).toContainEqual({ lemma: 'enigma', pos: ['noun'] });
    // never itself, still deduped
    expect(synonyms.map((entry) => entry.lemma)).not.toContain('arcana');

    expect(adapter.lookupAntonyms('arcana'))
      .toEqual([{ lemma: 'banality', pos: ['noun'] }]);

    const pos = adapter.batchLookupPos(['Arcana', 'mystery', 'unknown']);
    expect(pos).toEqual({
      arcana: ['noun', 'verb'],
      mystery: ['noun', 'verb'],
    });
    expect(adapter.batchLookupPos([])).toEqual({});

    adapter.close();
  });
```

And in the `'returns empty-safe methods when db path is missing'` test, after line 278 add:

```js
    expect(adapter.batchLookupPos(['arcana'])).toEqual({});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/server/lexicon.sqlite.adapter.test.js`
Expected: FAIL — `adapter.batchLookupPos is not a function`, and the synonym expectation fails because `lookupSynonyms` returns `['mystery', 'enigma']` (strings).

- [ ] **Step 3: Implement the adapter changes**

In `codex/server/adapters/lexicon.sqlite.adapter.js`:

3a. Extend the four prepared statements (lines ~263-293) to select POS:

```js
        lookupSynonyms: db.prepare(`
          SELECT l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_lemma l2 ON l1.synset_id = l2.synset_id
          WHERE l1.lemma_lower = ?
          LIMIT ?
        `),
        lookupAntonyms: db.prepare(`
          SELECT l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel = 'antonym'
          LIMIT ?
        `),
        lookupRelated: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('hypernym','hyponym','similar')
          LIMIT ?
        `),
        lookupSymbolsLoose: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma, l2.pos AS pos
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('has_domain_topic','domain_topic','exemplifies','is_exemplified_by')
          LIMIT ?
        `),
```

3b. Rewrite `sanitizeLemmaRows` (line ~556) to union POS per lemma. Duplicate rows for one lemma now carry distinct POS, so accumulate the whole row set before applying the limit:

```js
  function sanitizeLemmaRows(rows, word, limit = 20) {
    const boundedLimit = toBoundedLimit(limit, 20);
    const target = normalizeWord(word);
    const byLower = new Map();
    for (const row of rows) {
      const lemma = typeof row?.lemma === 'string' ? row.lemma.trim() : '';
      if (!lemma) continue;
      const lower = lemma.toLowerCase();
      if (lower === target) continue;
      let entry = byLower.get(lower);
      if (!entry) {
        entry = { lemma, pos: new Set() };
        byLower.set(lower, entry);
      }
      if (typeof row?.pos === 'string' && row.pos.trim()) entry.pos.add(row.pos.trim());
    }
    return [...byLower.values()]
      .slice(0, boundedLimit)
      .map((entry) => ({ lemma: entry.lemma, pos: [...entry.pos].sort() }));
  }
```

3c. In `lookupRelated` (~line 510), the dedupe currently strips rows down to `{ lemma }`; keep the POS by passing the rows through unchanged:

```js
    const bucket = { hypernym: [], hyponym: [], similar: [] };
    for (const row of rows) if (bucket[row.rel]) bucket[row.rel].push(row);
    const dedupe = (arr) => sanitizeLemmaRows(arr, normalized, limit);
```

3d. In `lookupSymbolsLoose` (~line 519), union POS across the seen-set:

```js
    const seen = new Map();
    const out = [];
    for (const row of rows) {
      const lemma = typeof row.lemma === 'string' ? row.lemma.trim() : '';
      if (!lemma || lemma.toLowerCase() === normalized) continue;
      const existing = seen.get(lemma.toLowerCase());
      if (existing) {
        if (typeof row.pos === 'string' && row.pos.trim()) existing.pos.add(row.pos.trim());
        continue;
      }
      const entry = {
        lemma,
        via: row.rel.includes('domain') ? 'domain' : 'exemplifies',
        pos: new Set(typeof row.pos === 'string' && row.pos.trim() ? [row.pos.trim()] : []),
      };
      seen.set(lemma.toLowerCase(), entry);
      if (out.length < limit) out.push(entry);
    }
    return out.map((entry) => ({ lemma: entry.lemma, via: entry.via, pos: [...entry.pos].sort() }));
```

3e. Add `batchLookupPos`, mirroring the `batchLookupFamilies` pattern. Next to the caches at line ~124 add:

```js
  const posBatchStmtCache = new Map();
```

After `batchValidateWords` (~line 482) add:

```js
  function batchLookupPos(words) {
    if (!tryConnect()) return {};
    const normalized = [...new Set((Array.isArray(words) ? words : [])
      .map(normalizeWord)
      .filter(Boolean))].sort();
    if (normalized.length === 0) return {};
    const placeholderCount = normalized.length;
    let statement = posBatchStmtCache.get(placeholderCount);
    if (!statement) {
      const placeholders = normalized.map(() => '?').join(', ');
      statement = db.prepare(`
        SELECT lemma_lower, pos
        FROM wordnet_lemma
        WHERE lemma_lower IN (${placeholders}) AND pos IS NOT NULL
      `);
      posBatchStmtCache.set(placeholderCount, statement);
    }
    const rows = statement.all(...normalized);
    const sets = new Map();
    for (const row of rows) {
      if (!row?.lemma_lower || typeof row.pos !== 'string' || !row.pos.trim()) continue;
      if (!sets.has(row.lemma_lower)) sets.set(row.lemma_lower, new Set());
      sets.get(row.lemma_lower).add(row.pos.trim());
    }
    const out = {};
    for (const [wordLower, posSet] of sets) out[wordLower] = [...posSet].sort();
    return out;
  }
```

And export it in the return object (~line 580), after `batchValidateWords`:

```js
    batchLookupPos,
```

3f. Update the two string-shape consumers so their payloads are unchanged.

`codex/server/services/world.service.js:50-55`:

```js
  const synonyms = typeof adapter?.lookupSynonyms === 'function'
    ? adapter.lookupSynonyms(normalizedLexeme, 12).map((entry) => entry.lemma)
    : [];
  const antonyms = typeof adapter?.lookupAntonyms === 'function'
    ? adapter.lookupAntonyms(normalizedLexeme, 12).map((entry) => entry.lemma)
    : [];
```

`codex/server/routes/lexicon.routes.js:91-95`:

```js
      const synonyms = typeof adapter.lookupSynonyms === 'function'
        ? adapter.lookupSynonyms(word, 20).map((entry) => entry.lemma)
        : [];
      const antonyms = typeof adapter.lookupAntonyms === 'function'
        ? adapter.lookupAntonyms(word, 20).map((entry) => entry.lemma)
        : [];
```

`tests/server/lexicon.routes.test.js:76-77` (payload assertions at 154-155 stay string arrays):

```js
    lookupSynonyms: vi.fn(() => [{ lemma: 'mystery', pos: ['noun'] }]),
    lookupAntonyms: vi.fn(() => [{ lemma: 'banality', pos: ['noun'] }]),
```

- [ ] **Step 4: Run the touched test files**

Run: `npx vitest run tests/server/lexicon.sqlite.adapter.test.js tests/server/lexicon.routes.test.js tests/server/lexicon.related.test.js`
Expected: PASS. (`world.service.js` has no dedicated test file; the routes test covers the string-mapping seam.)
Note: `lexicon.related.test.js` reads the real `scholomance_dict.sqlite` at the repo root; if that DB is absent those tests fail on connect — run the other two files and report the situation rather than skipping silently.

- [ ] **Step 5: Commit**

```bash
git add codex/server/adapters/lexicon.sqlite.adapter.js codex/server/services/world.service.js codex/server/routes/lexicon.routes.js tests/server/lexicon.sqlite.adapter.test.js tests/server/lexicon.routes.test.js
git commit -m "feat(dict): carry POS sets on lemma lookups and add batchLookupPos"
```

---

### Task 2: Service — normalized `pos: []` on word items

**Files:**
- Modify: `codex/server/services/lexicalAnalyze.service.js` (functions `related` ~73, `oppositions` ~111, `sound` ~121, `symbols` ~176)
- Test: `tests/server/lexicalAnalyze.service.test.js`

**Interfaces:**
- Consumes (from Task 1): `lookupSynonyms`/`lookupAntonyms` → `[{lemma, pos: string[]}]`; `lookupRelated` → `{broader/narrower/akin: [{lemma, pos}]}`; `lookupSymbolsLoose` → `[{lemma, via, pos}]`; `batchLookupPos(words)` → `{[wordLower]: string[]}`.
- Produces (Task 3 relies on this): items in groups `related`, `oppositions`, `sound`, `symbols` each carry `pos: string[]` with values drawn only from `['noun','verb','adjective','adverb']`, possibly empty. Items in `meaning`, `phrases`, `literary`, `corpus` have **no** `pos` property.

- [ ] **Step 1: Update fixtures and write the failing tests**

In `tests/server/lexicalAnalyze.service.test.js`, replace the `lexiconAdapter` fixture (lines 52-60) with the Task 1 shapes — including a deliberately unmappable raw POS (`'x'`) and a raw WordNet code (`'n'`) to prove normalization:

```js
  const lexiconAdapter = {
    lookupWord: (word) => entries.get(word) ?? [],
    lookupSynonyms: (word) => (word === 'leaf' ? [{ lemma: 'foliage', pos: ['n', 'x'] }] : []),
    lookupRelated: () => ({ broader: [], narrower: [], akin: [] }),
    lookupAntonyms: (word) => (word === 'dark' ? [{ lemma: 'light', pos: ['adjective', 'noun'] }] : []),
    lookupRhymes: (word) => ({ words: word === 'leaves' ? ['weaves', 'thieves'] : [], family: 'IYVZ' }),
    lookupSlantRhymes: () => [],
    lookupSymbolsLoose: () => [],
    batchLookupPos: (words) => (words.includes('weaves') ? { weaves: ['verb'] } : {}),
  };
```

Then add these tests at the end of the `describe` block:

```js
  it('states normalized POS facts on word items and leaves non-word groups untagged', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({
      scope: 'line',
      surface: 'leaves',
      containingLine: 'The tree sheds its leaves',
    }));

    const leaf = result.candidateResults.find((entry) => entry.candidateId === 'leaf/noun');
    const related = leaf.groups.find((group) => group.key === 'related');
    // 'n' normalizes to noun; 'x' is unmappable and must be dropped, not invented.
    expect(related.items).toContainEqual(expect.objectContaining({ text: 'foliage', pos: ['noun'] }));

    const sound = result.sharedGroups.find((group) => group.key === 'sound');
    expect(sound.items).toContainEqual(expect.objectContaining({ text: 'weaves', pos: ['verb'] }));
    // 'thieves' has no WordNet row: honest empty set, never a guess.
    expect(sound.items).toContainEqual(expect.objectContaining({ text: 'thieves', pos: [] }));

    for (const group of [...leaf.groups, ...result.sharedGroups]) {
      if (['meaning', 'phrases', 'literary', 'corpus'].includes(group.key)) {
        for (const item of group.items) expect(item).not.toHaveProperty('pos');
      }
    }
  });

  it('tags oppositions with the full multi-POS set', () => {
    const { service } = fixtures();
    const result = service.analyze(resolveAnalysisContext({ scope: 'word', surface: 'dark' }));
    const dark = result.candidateResults.find((entry) => entry.candidateId === 'dark/adjective');
    const oppositions = dark.groups.find((group) => group.key === 'oppositions');

    expect(oppositions.items).toContainEqual(expect.objectContaining({
      text: 'light',
      pos: ['adjective', 'noun'],
    }));
  });
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js`
Expected: the two new tests FAIL — items have no `pos`, and because the fixture now returns objects while the unmodified service still maps them as strings, item `text` comes out `undefined`. Both failures are the point; Step 3 makes the service consume the new shape.

- [ ] **Step 3: Implement the service changes**

In `codex/server/services/lexicalAnalyze.service.js`:

3a. Add a normalization helper after `posMatches` (~line 34):

```js
const CANONICAL_POS = Object.freeze(['noun', 'verb', 'adjective', 'adverb']);

function normalizePosSet(rawList) {
  const out = new Set();
  for (const raw of Array.isArray(rawList) ? rawList : []) {
    try {
      out.add(normalizeLemmaPos(raw));
    } catch {
      // Unmappable POS is dropped, never invented.
    }
  }
  return CANONICAL_POS.filter((pos) => out.has(pos));
}
```

3b. `related` (~line 73) — entries are `{lemma, pos}` now:

```js
  function related(candidate) {
    const synonyms = lexiconAdapter.lookupSynonyms(candidate.lemma, 12)
      .map((entry) => ({
        text: entry.lemma,
        pos: normalizePosSet(entry.pos),
        source: 'wordnet:synonym',
        confidence: 0.8,
        ref: { kind: 'word', id: entry.lemma },
      }));
    const relation = lexiconAdapter.lookupRelated(candidate.lemma, 10);
    const relatedItem = (entry, source, note, confidence) => ({
      text: entry.lemma,
      pos: normalizePosSet(entry.pos),
      source,
      confidence,
      note,
      ref: { kind: 'word', id: entry.lemma },
    });
    const broader = relation.broader.map((entry) => relatedItem(entry, 'wordnet:hypernym', 'broader', 0.7));
    const narrower = relation.narrower.map((entry) => relatedItem(entry, 'wordnet:hyponym', 'narrower', 0.7));
    const akin = relation.akin.map((entry) => relatedItem(entry, 'wordnet:similar', 'akin', 0.65));
    return group(
      'related',
      'Related language',
      [...synonyms, ...akin, ...broader, ...narrower],
      'No related words found.',
    );
  }
```

3c. `oppositions` (~line 111):

```js
  function oppositions(candidate) {
    const items = lexiconAdapter.lookupAntonyms(candidate.lemma, 12).map((entry) => ({
      text: entry.lemma,
      pos: normalizePosSet(entry.pos),
      source: 'wordnet:antonym',
      confidence: 0.8,
      ref: { kind: 'word', id: entry.lemma },
    }));
    return group('oppositions', 'Oppositions', items, 'No antonym source ingested yet.');
  }
```

3d. `sound` (~line 121) — batch-classify both perfect and slant words. Guard the method so a lexicon adapter without `batchLookupPos` degrades to empty sets:

```js
  function sound(surface) {
    const rhymes = lexiconAdapter.lookupRhymes(surface, 14);
    const perfectWords = rhymes.words || [];
    const slantWords = lexiconAdapter.lookupSlantRhymes(surface, 10) || [];
    const posByWord = typeof lexiconAdapter.batchLookupPos === 'function'
      ? lexiconAdapter.batchLookupPos([...perfectWords, ...slantWords])
      : {};
    const wordPos = (word) => normalizePosSet(posByWord[canonical(word)] ?? []);
    const perfect = perfectWords.map((word) => ({
      text: word,
      pos: wordPos(word),
      source: 'rhyme_index',
      confidence: 0.9,
      note: rhymes.family || undefined,
      ref: { kind: 'word', id: word },
    }));
    const slant = slantWords.map((word) => ({
      text: word,
      pos: wordPos(word),
      source: 'rhyme_index:slant',
      confidence: 0.6,
      derived: true,
      note: 'slant',
    }));
    return group('sound', 'Sound', [...perfect, ...slant], 'No rhymes found.');
  }
```

3e. `symbols` (~line 176):

```js
  function symbols(candidate) {
    const rows = lexiconAdapter.lookupSymbolsLoose(candidate.lemma, 10).map((row) => ({
      text: row.lemma,
      pos: normalizePosSet(row.pos),
      source: `wordnet:${row.via}`,
      confidence: 0.4,
      derived: true,
      note: row.via === 'domain' ? 'shares a domain (loose)' : 'exemplified by (loose)',
    }));
    return group('symbols', 'Symbols', rows, 'No symbol ingest yet; loose links only.');
  }
```

- [ ] **Step 4: Run the service tests**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js`
Expected: PASS — all 8 tests (6 existing + 2 new).

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/lexicalAnalyze.service.js tests/server/lexicalAnalyze.service.test.js
git commit -m "feat(analyze): state normalized POS facts on word items"
```

---

### Task 3: Client — POS sub-buckets in `AnalyzePanel`

**Files:**
- Modify: `src/pages/Read/AnalyzePanel.jsx` (`ResultGroup`, lines 22-61)
- Modify: `src/pages/Read/AnalyzePanel.css` (append bucket styles)
- Test: `tests/pages/Read/AnalyzePanel.test.jsx`

**Interfaces:**
- Consumes (from Task 2): items with optional `pos: string[]` drawn from `['noun','verb','adjective','adverb']`.
- Produces: presentation only — no new exports. Bucket subheadings are `h4` elements; group `h3` count stays `items.length` (contract items are already distinct; duplication is display-only).

- [ ] **Step 1: Write the failing component test**

In `tests/pages/Read/AnalyzePanel.test.jsx`, extend the fixture helpers (lines 20-21) so items can carry POS:

```js
const item = (text, source = 'fixture', pos) => ({
  text,
  source,
  confidence: 0.8,
  ...(pos !== undefined ? { pos } : {}),
});
const group = (key, label, words) => ({
  key,
  label,
  items: words.map((word) => (Array.isArray(word) ? item(word[0], 'fixture', word[1]) : item(word))),
});
```

Then add this test at the end of the `describe` block:

```js
  it('buckets pos-tagged words by part of speech, alphabetized, duplicating multi-POS words', () => {
    const result = resultFixture();
    result.sharedGroups[0] = group('sound', 'Sound', [
      ['weaves', ['verb']],
      ['stress', ['noun', 'verb']],
      ['achieves', []],
      ['believes', ['verb']],
    ]);
    analyzeHook.state = { result, loading: false, error: null };
    renderPanel();

    const results = screen.getByTestId('analyze-results');
    const soundGroup = within(results).getByRole('heading', { level: 3, name: /^Sound/ }).closest('section');

    const bucketHeadings = within(soundGroup).getAllByRole('heading', { level: 4 })
      .map((heading) => heading.textContent);
    expect(bucketHeadings).toEqual(['Nouns 1', 'Verbs 3', 'Unclassified 1']);

    // Multi-POS word appears in both buckets; alphabetized within each.
    const texts = [...soundGroup.querySelectorAll('.az-item__text')].map((node) => node.textContent);
    expect(texts).toEqual(['stress', 'believes', 'stress', 'weaves', 'achieves']);

    // Group heading counts distinct items, not the duplicated total.
    expect(within(soundGroup).getByRole('heading', { level: 3 })).toHaveTextContent('Sound 4');

    // Groups without pos fields render flat: no h4 buckets in Meaning.
    const meaningGroup = within(results).getByRole('heading', { level: 3, name: /^Meaning/ }).closest('section');
    expect(within(meaningGroup).queryAllByRole('heading', { level: 4 })).toHaveLength(0);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/pages/Read/AnalyzePanel.test.jsx`
Expected: the new test FAILS (no `h4` headings rendered); the 5 existing tests PASS.

- [ ] **Step 3: Implement bucketed rendering**

In `src/pages/Read/AnalyzePanel.jsx`, replace `ResultGroup` (lines 22-51) with:

```jsx
const POS_BUCKETS = [
  ['noun', 'Nouns'],
  ['verb', 'Verbs'],
  ['adjective', 'Adjectives'],
  ['adverb', 'Adverbs'],
  ['unclassified', 'Unclassified'],
];

function bucketByPos(items) {
  const byBucket = new Map(POS_BUCKETS.map(([key]) => [key, []]));
  for (const entry of items) {
    const poses = (Array.isArray(entry.pos) ? entry.pos : []).filter((pos) => byBucket.has(pos));
    if (poses.length === 0) byBucket.get('unclassified').push(entry);
    else for (const pos of poses) byBucket.get(pos).push(entry);
  }
  return POS_BUCKETS
    .map(([key, label]) => ({
      key,
      label,
      items: [...byBucket.get(key)].sort((a, b) => (
        String(a.text).localeCompare(String(b.text), 'en', { sensitivity: 'base' })
      )),
    }))
    .filter((bucket) => bucket.items.length > 0);
}

function ItemList({ groupKey, bucketKey, items, onAction }) {
  return (
    <ul className="az-list">
      {items.map((item, index) => (
        <li key={`${groupKey}-${bucketKey}-${item.text}-${index}`} className={`az-item${item.derived ? ' az-item--derived' : ''}`}>
          <span className="az-item__text">{item.text}</span>
          <span className="az-item__meta">
            <span className="az-chip" title={item.note || ''}>{item.source || 'source'}</span>
            {item.derived && <span className="az-chip az-chip--loose">derived</span>}
          </span>
          <span className="az-actions" aria-label={`Craft actions for ${item.text}`}>
            <button type="button" onClick={() => onAction('insert', item)} title="Insert at cursor" aria-label={`Insert ${item.text}`}>⤵</button>
            <button type="button" onClick={() => onAction('replace', item)} title="Replace selection" aria-label={`Replace with ${item.text}`}>⇄</button>
            <button type="button" onClick={() => onAction('pin', item)} title="Pin" aria-label={`Pin ${item.text}`}>📌</button>
          </span>
        </li>
      ))}
    </ul>
  );
}

ItemList.propTypes = {
  groupKey: PropTypes.string.isRequired,
  bucketKey: PropTypes.string.isRequired,
  items: PropTypes.arrayOf(PropTypes.object).isRequired,
  onAction: PropTypes.func.isRequired,
};

function ResultGroup({ group, onAction }) {
  const items = Array.isArray(group?.items) ? group.items : [];
  const bucketed = items.some((entry) => Array.isArray(entry.pos));
  return (
    <section className="az-group">
      <h3 className="az-group__title">
        {group?.label || group?.key} <span className="az-group__count">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="az-empty">{group?.emptyReason || 'No results in this channel.'}</p>
      ) : bucketed ? (
        bucketByPos(items).map((bucket) => (
          <div key={`${group.key}-${bucket.key}`} className="az-bucket">
            <h4 className="az-bucket__title">
              {bucket.label} <span className="az-group__count">{bucket.items.length}</span>
            </h4>
            <ItemList groupKey={group.key} bucketKey={bucket.key} items={bucket.items} onAction={onAction} />
          </div>
        ))
      ) : (
        <ItemList groupKey={group.key} bucketKey="all" items={items} onAction={onAction} />
      )}
    </section>
  );
}
```

(`ResultGroup`'s existing PropTypes block stays as-is.)

Note the old flat `<li>` key was `${group.key}-${item.text}-${index}`; `ItemList` reproduces it with the bucket key inserted, so duplicated words in different buckets cannot collide.

Append to `src/pages/Read/AnalyzePanel.css`:

```css
.az-bucket {
  margin-top: 0.35rem;
}

.az-bucket__title {
  margin: 0.25rem 0 0.1rem;
  font-size: 0.72rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}
```

- [ ] **Step 4: Run the component tests**

Run: `npx vitest run tests/pages/Read/AnalyzePanel.test.jsx`
Expected: PASS — all 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css tests/pages/Read/AnalyzePanel.test.jsx
git commit -m "feat(analyze): bucket word results by part of speech"
```

---

### Task 4: Rename user-facing copy to "Leximancy"

**Files:**
- Modify: `src/pages/Read/ToolsSidebar.jsx:165` (mode button label)
- Modify: `src/pages/Read/ControlConsole.jsx:124` (mode segment label)
- Modify: `src/pages/Read/MobileHexSheet.jsx:10` (mode label)
- Modify: `src/pages/Read/AnalyzePanel.jsx` (placeholder + aria copy)
- Modify: `tests/visual/lexical-analyze.real.spec.js:14,17` (selectors)

**Interfaces:**
- Consumes: nothing from other tasks (independent; can run in parallel with Tasks 1-3).
- Produces: display copy only. `ANALYSIS_MODES.ANALYZE` and every other identifier keep the `analyze` naming.

- [ ] **Step 1: Update the mode labels**

`src/pages/Read/ToolsSidebar.jsx:165`: `<span className="tool-label">Analyze</span>` → `<span className="tool-label">Leximancy</span>`.

`src/pages/Read/ControlConsole.jsx:124`: `{ id: ANALYSIS_MODES.ANALYZE, label: 'Analyze', icon: AnalyzeIcon },` → `{ id: ANALYSIS_MODES.ANALYZE, label: 'Leximancy', icon: AnalyzeIcon },`.

`src/pages/Read/MobileHexSheet.jsx:10`: `{ id: ANALYSIS_MODES.ANALYZE,   label: 'Analyze'   },` → `{ id: ANALYSIS_MODES.ANALYZE,   label: 'Leximancy' },`.

Leave untouched: the `isAnalyzing` footer "Analyzing..." in `ToolsSidebar.jsx` (TrueSight engine status), ControlConsole engine readouts, and `GrimDesignPanel.jsx` (different feature).

- [ ] **Step 2: Update AnalyzePanel copy**

In `src/pages/Read/AnalyzePanel.jsx`:
- Line 168: `placeholder="Analyze a word or surface form…"` → `placeholder="Leximancy: a word or surface form…"`
- Line 169: `aria-label="Analyze query"` → `aria-label="Leximancy query"`
- Line 174: `aria-label="Clear analysis"` → `aria-label="Clear leximancy"`
- Line 213: `aria-label="Pinned Analyze results"` → `aria-label="Pinned Leximancy results"`
- Line 172 stays `{loading ? 'Analyzing…' : 'Search'}` — verb copy, not the feature name.

- [ ] **Step 3: Update the visual spec selectors**

In `tests/visual/lexical-analyze.real.spec.js`:
- Line 14: `await page.locator('.console-seg', { hasText: 'Analyze' }).click();` → `await page.locator('.console-seg', { hasText: 'Leximancy' }).click();`
- Line 17: `const input = panel.getByLabel('Analyze query');` → `const input = panel.getByLabel('Leximancy query');`

- [ ] **Step 4: Run the component tests to confirm nothing keyed on the old copy**

Run: `npx vitest run tests/pages/Read/AnalyzePanel.test.jsx`
Expected: PASS (its queries are role-based, not copy-based).
Also run: `grep -rn "getByLabel('Analyze" tests/ src/` — Expected: no matches remain.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Read/ToolsSidebar.jsx src/pages/Read/ControlConsole.jsx src/pages/Read/MobileHexSheet.jsx src/pages/Read/AnalyzePanel.jsx tests/visual/lexical-analyze.real.spec.js
git commit -m "feat(scribe): rename Analyze display copy to Leximancy"
```

---

### Task 5: Verification sweep

**Files:**
- No new files; runs checks over Tasks 1-4.

**Interfaces:**
- Consumes: the four commits above.
- Produces: green suite + SCD64 self-check evidence.

- [ ] **Step 1: Run every test file this plan touched or that consumes the changed code**

Run: `npx vitest run tests/server/lexicon.sqlite.adapter.test.js tests/server/lexicon.routes.test.js tests/server/lexicalAnalyze.service.test.js tests/pages/Read/AnalyzePanel.test.jsx tests/pages/Read/useLexicalAnalyze.test.jsx tests/pages/Read/analysisContext.test.js`
Expected: all PASS.

- [ ] **Step 2: Run the SCD64 fossil self-check (project law)**

Run: `npm run scd64:intellisense`
Expected: no findings against the diff. If the command reports findings in files this plan touched, fix them before proceeding.

- [ ] **Step 3: Live check (only if a dev server is available)**

Run: `npm run dev`, open `http://localhost:5173`, enter the Read IDE, switch to the **Leximancy** mode, search a word with rhymes (e.g. "leaves") on Line scope.
Expected: Sound / Related / Oppositions / Symbols groups show Nouns / Verbs / Adjectives / Adverbs / Unclassified subheadings with alphabetized words; Meaning and Corpus render flat; mode buttons say "Leximancy". The known ~50 VideoForge TS errors are out of scope and not blockers.

- [ ] **Step 4: Final commit if anything was fixed in steps 1-3**

```bash
git add -A && git commit -m "test(analyze): verification sweep for POS buckets and Leximancy copy"
```

(Skip if the tree is clean.)
