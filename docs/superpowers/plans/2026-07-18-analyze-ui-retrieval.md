# Analyze UI + Retrieval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Read IDE Analyze mode into a submit-only poetic search engine over the lexical graph + legacy dictionary, with evidence-backed result groups and craft actions.

**Architecture:** A vertical slice — one-time device seed → `lexicalAnalyze.service` composes groups from the existing `lexiconAdapter` (words/rhyme/WordNet) and `lexicalGraphAdapter` (devices) → Fastify `POST /api/lexical/analyze` (submit-only, zod, cached) → a new React `AnalyzePanel` rendered in Analyze mode. Astrology mode keeps the current `AnalysisPanel`.

**Tech Stack:** Node/Fastify, better-sqlite3, zod (backend); React + framer-motion (frontend); Vitest.

## Global Constraints

- **Honesty law:** no group renders fabricated data. Groups with no rows return `{ items: [], emptyReason }`. Loose/bridged results carry `derived: true` + `note`.
- **Submit-only:** search fires on Enter / Search button only. Never fetch on keystroke.
- **Same-origin API law:** the client uses the relative path `/api/lexical/analyze`. Never resolve or bake an API origin.
- **Read-only DB:** the service never writes to `scholomance_dict.sqlite`. Overlay writes happen only via `scripts/lexical-graph.mjs`.
- **DB path:** reuse `SCHOLOMANCE_DICT_PATH` from `codex/server/index.js`. Both adapters point at it.
- **Reuse over rebuild:** words come from the existing `lexiconAdapter` (`codex/server/adapters/lexicon.sqlite.adapter.js`); devices from `lexicalGraphAdapter` (`codex/server/adapters/lexicalGraph.sqlite.adapter.js`). Do not open new DB connections in the service.

---

## File Structure

- Create `codex/server/services/lexicalAnalyze.service.js` — composition layer (groups).
- Create `codex/server/routes/lexicalAnalyze.routes.js` — Fastify plugin, `POST /api/lexical/analyze`.
- Modify `codex/server/adapters/lexicon.sqlite.adapter.js` — add `lookupRelated`, `lookupSymbolsLoose`.
- Modify `codex/server/index.js` — instantiate `lexicalGraphAdapter`; register the route.
- Create `src/pages/Read/useLexicalAnalyze.js` — submit-only client hook.
- Create `src/pages/Read/AnalyzePanel.jsx` + `AnalyzePanel.css` — the panel UI + craft actions.
- Modify `src/pages/Read/ReadPage.jsx` — render `AnalyzePanel` in Analyze mode; keep `AnalysisPanel` for Astrology.
- Tests: `tests/server/lexicalAnalyze.service.test.js`, `tests/server/lexicalAnalyze.routes.test.js`, `tests/server/lexicon.related.test.js`.

---

### Task 0: One-time device seed (data prep)

**Files:** none created; writes overlay tables into `scholomance_dict.sqlite`.

- [ ] **Step 1: Confirm overlay is absent**

Run: `node -e "const D=require('better-sqlite3');const db=new D('scholomance_dict.sqlite',{readonly:true});console.log(db.prepare(\"select count(*) c from sqlite_master where name='literary_device'\").get().c)"`
Expected: `0`

- [ ] **Step 2: Migrate + seed devices**

```bash
TS=$(date -u +%Y-%m-%dT%H:%M:%SZ)
node scripts/lexical-graph.mjs migrate      --db scholomance_dict.sqlite --timestamp "$TS"
node scripts/lexical-graph.mjs seed-devices  --db scholomance_dict.sqlite --timestamp "$TS"
```

- [ ] **Step 3: Verify 10 devices seeded**

Run: `node -e "const D=require('better-sqlite3');const db=new D('scholomance_dict.sqlite',{readonly:true});console.log('devices',db.prepare('select count(*) c from literary_device').get().c,'relations',db.prepare('select count(*) c from lexical_relation').get().c)"`
Expected: `devices 10 relations <N>` (N > 0)

- [ ] **Step 4: Commit** (the CLI touched no source; nothing to commit unless the DB is tracked — if `scholomance_dict.sqlite` is gitignored, skip). Verify with `git status --short scholomance_dict.sqlite`.

---

### Task 1: Legacy adapter — `lookupRelated` + `lookupSymbolsLoose`

**Files:**
- Modify: `codex/server/adapters/lexicon.sqlite.adapter.js`
- Test: `tests/server/lexicon.related.test.js`

**Interfaces:**
- Produces: `lookupRelated(word, limit=20) -> { broader: string[], narrower: string[], akin: string[] }`
  (hypernym → broader, hyponym → narrower, similar → akin). `lookupSymbolsLoose(word, limit=12) -> Array<{ lemma: string, via: 'domain'|'exemplifies' }>`.

- [ ] **Step 1: Write the failing test**

```js
// tests/server/lexicon.related.test.js
import { describe, it, expect } from 'vitest';
import { createLexiconAdapter } from '../../codex/server/adapters/lexicon.sqlite.adapter.js';

const DB = 'scholomance_dict.sqlite';

describe('lexicon relations', () => {
  it('returns broader/narrower/akin for a common noun', () => {
    const a = createLexiconAdapter(DB);
    const rel = a.lookupRelated('dog', 20);
    expect(Array.isArray(rel.broader)).toBe(true);
    expect(rel.broader.length + rel.narrower.length + rel.akin.length).toBeGreaterThan(0);
    a.close();
  });
  it('symbols-loose returns domain/exemplifies lemmas or empty', () => {
    const a = createLexiconAdapter(DB);
    const rows = a.lookupSymbolsLoose('rose', 12);
    expect(Array.isArray(rows)).toBe(true);
    for (const r of rows) expect(['domain', 'exemplifies']).toContain(r.via);
    a.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/lexicon.related.test.js`
Expected: FAIL — `a.lookupRelated is not a function`.

- [ ] **Step 3: Add prepared statements** — inside `tryConnect()`'s `stmts = { ... }` block, add:

```js
        lookupRelated: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('hypernym','hyponym','similar')
          LIMIT ?
        `),
        lookupSymbolsLoose: db.prepare(`
          SELECT r.rel AS rel, l2.lemma AS lemma
          FROM wordnet_lemma l1
          JOIN wordnet_rel r ON l1.synset_id = r.synset_id
          JOIN wordnet_lemma l2 ON r.target_synset_id = l2.synset_id
          WHERE l1.lemma_lower = ? AND r.rel IN ('has_domain_topic','domain_topic','exemplifies','is_exemplified_by')
          LIMIT ?
        `),
```

- [ ] **Step 4: Add the functions** — near `lookupSynonyms` (after line ~482):

```js
  function lookupRelated(word, limit = 20) {
    if (!tryConnect()) return { broader: [], narrower: [], akin: [] };
    const normalized = normalizeWord(word);
    if (!normalized) return { broader: [], narrower: [], akin: [] };
    const boundedLimit = toBoundedLimit(limit * 3, 60);
    const rows = stmts.lookupRelated.all(normalized, boundedLimit);
    const bucket = { hypernym: [], hyponym: [], similar: [] };
    for (const row of rows) if (bucket[row.rel]) bucket[row.rel].push(row.lemma);
    const dedupe = (arr) => sanitizeLemmaRows(arr.map((lemma) => ({ lemma })), normalized, limit);
    return { broader: dedupe(bucket.hypernym), narrower: dedupe(bucket.hyponym), akin: dedupe(bucket.similar) };
  }

  function lookupSymbolsLoose(word, limit = 12) {
    if (!tryConnect()) return [];
    const normalized = normalizeWord(word);
    if (!normalized) return [];
    const rows = stmts.lookupSymbolsLoose.all(normalized, toBoundedLimit(limit * 2, 30));
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const lemma = typeof row.lemma === 'string' ? row.lemma.trim() : '';
      if (!lemma || lemma.toLowerCase() === normalized || seen.has(lemma.toLowerCase())) continue;
      seen.add(lemma.toLowerCase());
      out.push({ lemma, via: row.rel.includes('domain') ? 'domain' : 'exemplifies' });
      if (out.length >= limit) break;
    }
    return out;
  }
```

- [ ] **Step 5: Export them** — add `lookupRelated,` and `lookupSymbolsLoose,` to the final `return { ... }` object (beside `lookupSynonyms`).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/server/lexicon.related.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add codex/server/adapters/lexicon.sqlite.adapter.js tests/server/lexicon.related.test.js
git commit -m "feat(analyze): add lookupRelated + lookupSymbolsLoose to lexicon adapter"
```

---

### Task 2: `lexicalAnalyze.service`

**Files:**
- Create: `codex/server/services/lexicalAnalyze.service.js`
- Test: `tests/server/lexicalAnalyze.service.test.js`

**Interfaces:**
- Consumes: `lexiconAdapter` (`lookupWord`, `lookupSynonyms`, `lookupAntonyms`, `lookupRhymes`, `lookupSlantRhymes`, `lookupRelated`, `lookupSymbolsLoose`, `extractGloss`), `lexicalGraphAdapter` (`searchFts`, `getLiteraryDevice`, `listLiteraryDevices`).
- Produces: `createLexicalAnalyzeService({ lexiconAdapter, lexicalGraphAdapter }) -> { analyze(query) -> AnalyzeResult }`.
  `AnalyzeResult = { query, canonical, generatedAt, groups: AnalyzeGroup[] }`.
  `AnalyzeGroup = { key, label, items: AnalyzeItem[], emptyReason?: string }`.
  `AnalyzeItem = { text, source, sourceUrl?, confidence, derived?, note?, ref? }`.

- [ ] **Step 1: Write the failing test**

```js
// tests/server/lexicalAnalyze.service.test.js
import { describe, it, expect } from 'vitest';
import { createLexiconAdapter } from '../../codex/server/adapters/lexicon.sqlite.adapter.js';
import { createLexicalGraphAdapter } from '../../codex/server/adapters/lexicalGraph.sqlite.adapter.js';
import { createLexicalAnalyzeService } from '../../codex/server/services/lexicalAnalyze.service.js';

const DB = 'scholomance_dict.sqlite';
function svc() {
  return createLexicalAnalyzeService({
    lexiconAdapter: createLexiconAdapter(DB),
    lexicalGraphAdapter: createLexicalGraphAdapter(DB),
  });
}

describe('lexicalAnalyze.service', () => {
  it('produces all group keys in fixed order', () => {
    const r = svc().analyze('dark');
    expect(r.groups.map((g) => g.key)).toEqual([
      'meaning', 'related', 'oppositions', 'sound', 'phrases',
      'literary', 'symbols', 'corpus',
    ]);
  });
  it('fills meaning + sound + related for a real word', () => {
    const r = svc().analyze('dark');
    const by = Object.fromEntries(r.groups.map((g) => [g.key, g]));
    expect(by.meaning.items.length).toBeGreaterThan(0);
    expect(by.sound.items.length).toBeGreaterThan(0);
    expect(by.related.items.length).toBeGreaterThan(0);
  });
  it('oppositions + phrases are honest-empty (no fabrication)', () => {
    const r = svc().analyze('dark');
    const by = Object.fromEntries(r.groups.map((g) => [g.key, g]));
    expect(by.oppositions.items).toEqual([]);
    expect(by.oppositions.emptyReason).toMatch(/antonym/i);
    expect(by.phrases.items).toEqual([]);
    expect(by.phrases.emptyReason).toMatch(/phrase/i);
  });
  it('symbols items are flagged derived', () => {
    const r = svc().analyze('rose');
    const sym = r.groups.find((g) => g.key === 'symbols');
    for (const it of sym.items) expect(it.derived).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the service**

```js
// codex/server/services/lexicalAnalyze.service.js
// Read-only composition of the Analyze result groups. No DB access of its own —
// words come from lexiconAdapter, devices from lexicalGraphAdapter (honesty law:
// a group with no rows returns { items: [], emptyReason }; loose rows carry derived:true).

const GROUP_ORDER = [
  ['meaning', 'Meaning'],
  ['related', 'Related language'],
  ['oppositions', 'Oppositions'],
  ['sound', 'Sound'],
  ['phrases', 'Phrases'],
  ['literary', 'Literary techniques'],
  ['symbols', 'Symbols'],
  ['corpus', 'Corpus examples'],
];

const canonical = (q) => String(q || '').trim().toLowerCase();

function group(key, label, items, emptyReason) {
  const list = items.filter(Boolean);
  if (list.length === 0) return { key, label, items: [], emptyReason: emptyReason || 'No results in the graph yet.' };
  return { key, label, items: list };
}

export function createLexicalAnalyzeService({ lexiconAdapter, lexicalGraphAdapter }) {
  function meaning(word) {
    const entry = lexiconAdapter.lookupWord(word);
    const senses = entry?.senses || [];
    const glosses = senses.flatMap((s) => (Array.isArray(s?.glosses) ? s.glosses : [])).slice(0, 8);
    return group('meaning', 'Meaning', glosses.map((g) => ({
      text: g, source: 'entry:gloss', sourceUrl: entry?.sourceUrl, confidence: 0.9,
      ref: entry ? { kind: 'word', id: String(entry.id) } : undefined,
    })), 'No dictionary entry found.');
  }
  function related(word) {
    const syn = lexiconAdapter.lookupSynonyms(word, 12)
      .map((w) => ({ text: w, source: 'wordnet:synonym', confidence: 0.8, ref: { kind: 'word', id: w } }));
    const rel = lexiconAdapter.lookupRelated(word, 10);
    const broader = rel.broader.map((w) => ({ text: w, source: 'wordnet:hypernym', confidence: 0.7, note: 'broader', ref: { kind: 'word', id: w } }));
    const narrower = rel.narrower.map((w) => ({ text: w, source: 'wordnet:hyponym', confidence: 0.7, note: 'narrower', ref: { kind: 'word', id: w } }));
    const akin = rel.akin.map((w) => ({ text: w, source: 'wordnet:similar', confidence: 0.65, note: 'akin', ref: { kind: 'word', id: w } }));
    return group('related', 'Related language', [...syn, ...akin, ...broader, ...narrower], 'No related words found.');
  }
  function oppositions(word) {
    const ant = lexiconAdapter.lookupAntonyms(word, 12)
      .map((w) => ({ text: w, source: 'wordnet:antonym', confidence: 0.8, ref: { kind: 'word', id: w } }));
    return group('oppositions', 'Oppositions', ant, 'No antonym source ingested yet.');
  }
  function sound(word) {
    const r = lexiconAdapter.lookupRhymes(word, 14);
    const perfect = (r.words || []).map((w) => ({ text: w, source: 'rhyme_index', confidence: 0.9, note: r.family || undefined, ref: { kind: 'word', id: w } }));
    const slant = (lexiconAdapter.lookupSlantRhymes(word, 10) || [])
      .map((w) => ({ text: typeof w === 'string' ? w : w.word, source: 'rhyme_index:slant', confidence: 0.6, derived: true, note: 'slant' }));
    return group('sound', 'Sound', [...perfect, ...slant], 'No rhymes found.');
  }
  function phrases() {
    return group('phrases', 'Phrases', [], 'Phrase ingest not yet available.');
  }
  function literary(word) {
    const page = lexicalGraphAdapter.searchFts(word, { types: ['device'], limit: 8 });
    let devices = (page.results || []);
    if (devices.length === 0) devices = (lexicalGraphAdapter.listLiteraryDevices({ limit: 6 }).results || []);
    const items = devices.map((d) => ({
      text: d.canonicalText || d.name || d.slug, source: 'device', confidence: 0.85,
      ref: { kind: 'device', id: String(d.id ?? d.entryId ?? d.slug) },
      note: d.definition ? String(d.definition).slice(0, 120) : undefined,
    }));
    return group('literary', 'Literary techniques', items, 'Device overlay not migrated.');
  }
  function symbols(word) {
    const rows = lexiconAdapter.lookupSymbolsLoose(word, 10).map((r) => ({
      text: r.lemma, source: `wordnet:${r.via}`, confidence: 0.4, derived: true,
      note: r.via === 'domain' ? 'shares a domain (loose)' : 'exemplified by (loose)',
    }));
    return group('symbols', 'Symbols', rows, 'No symbol ingest yet; loose links only.');
  }
  function corpus(word) {
    const entry = lexiconAdapter.lookupWord(word);
    const ex = (entry?.senses || []).flatMap((s) => (Array.isArray(s?.examples) ? s.examples : [])).slice(0, 6);
    return group('corpus', 'Corpus examples', ex.map((e) => ({
      text: e, source: 'entry:example', confidence: 0.7, derived: true, note: 'dictionary example',
    })), 'No corpus examples found.');
  }

  function analyze(query) {
    const c = canonical(query);
    const groups = [meaning(c), related(c), oppositions(c), sound(c), phrases(), literary(c), symbols(c), corpus(c)];
    return { query: String(query), canonical: c, generatedAt: new Date().toISOString(), groups };
  }
  return { analyze };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js`
Expected: PASS (4 tests). If `lookupWord`/`lookupSlantRhymes` return shapes differ, adjust field access to the adapter's actual return (confirm by reading the adapter) — do not invent fields.

- [ ] **Step 5: Commit**

```bash
git add codex/server/services/lexicalAnalyze.service.js tests/server/lexicalAnalyze.service.test.js
git commit -m "feat(analyze): lexicalAnalyze composition service (8 groups, honest-empty)"
```

---

### Task 3: Route `POST /api/lexical/analyze` + server wiring

**Files:**
- Create: `codex/server/routes/lexicalAnalyze.routes.js`
- Modify: `codex/server/index.js` (instantiate graph adapter + register route)
- Test: `tests/server/lexicalAnalyze.routes.test.js`

**Interfaces:**
- Consumes: `createLexicalAnalyzeService` (Task 2), the two adapters.
- Produces: Fastify plugin default-exported as `lexicalAnalyzeRoutes(fastify, opts)`; expects `opts.service`. Route `POST /analyze` returns `AnalyzeResult` JSON; 400 on invalid body.

- [ ] **Step 1: Write the failing test**

```js
// tests/server/lexicalAnalyze.routes.test.js
import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { lexicalAnalyzeRoutes } from '../../codex/server/routes/lexicalAnalyze.routes.js';

function build(service) {
  const app = Fastify();
  app.register(lexicalAnalyzeRoutes, { prefix: '/api/lexical', service });
  return app;
}
const fakeService = { analyze: (q) => ({ query: q, canonical: q, generatedAt: 'T', groups: [{ key: 'meaning', label: 'Meaning', items: [] }] }) };

describe('POST /api/lexical/analyze', () => {
  it('returns groups for a valid query', async () => {
    const app = build(fakeService);
    const res = await app.inject({ method: 'POST', url: '/api/lexical/analyze', payload: { query: 'dark' } });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).groups[0].key).toBe('meaning');
    await app.close();
  });
  it('rejects empty query with 400', async () => {
    const app = build(fakeService);
    const res = await app.inject({ method: 'POST', url: '/api/lexical/analyze', payload: { query: '' } });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/server/lexicalAnalyze.routes.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the route plugin**

```js
// codex/server/routes/lexicalAnalyze.routes.js
// Submit-only poetic search over the lexical graph. One POST; no keystroke path.
import { createHash } from 'crypto';
import { z } from 'zod';

const MAX_QUERY_LEN = 80;
const CACHE_TTL_MS = 5 * 60 * 1000;
const CACHE_MAX = 500;
const bodySchema = z.object({ query: z.string().trim().min(1).max(MAX_QUERY_LEN) });

export async function lexicalAnalyzeRoutes(fastify, opts) {
  const service = opts.service;
  const cache = new Map();
  const keyOf = (q) => createHash('sha256').update(q.toLowerCase()).digest('hex');

  fastify.post('/analyze', async (request, reply) => {
    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'invalid query' });
    const query = parsed.data.query;
    const key = keyOf(query);
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < CACHE_TTL_MS) return hit.v;
    const result = service.analyze(query);
    if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
    cache.set(key, { t: Date.now(), v: result });
    return result;
  });
}

export default lexicalAnalyzeRoutes;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/server/lexicalAnalyze.routes.test.js`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `codex/server/index.js`**

After the `lexiconAdapter` instantiation (~line 223), add:

```js
import { createLexicalGraphAdapter } from './adapters/lexicalGraph.sqlite.adapter.js';
import { createLexicalAnalyzeService } from './services/lexicalAnalyze.service.js';
import { lexicalAnalyzeRoutes } from './routes/lexicalAnalyze.routes.js';
// ...
const lexicalGraphAdapter = createLexicalGraphAdapter(SCHOLOMANCE_DICT_PATH, { log: fastify.log });
const lexicalAnalyzeService = createLexicalAnalyzeService({ lexiconAdapter, lexicalGraphAdapter });
```

Near the other `fastify.register(...)` calls (~line 1136), add:

```js
fastify.register(lexicalAnalyzeRoutes, { prefix: '/api/lexical', service: lexicalAnalyzeService });
```

- [ ] **Step 6: Smoke-test the live route**

Run (dev server on :5173 proxies to the API, or hit the API port directly):
`curl -s -XPOST localhost:5173/api/lexical/analyze -H 'content-type: application/json' -d '{"query":"dark"}' | head -c 300`
Expected: JSON with `"groups"` and a non-empty `meaning`/`sound` group.

- [ ] **Step 7: Commit**

```bash
git add codex/server/routes/lexicalAnalyze.routes.js codex/server/index.js tests/server/lexicalAnalyze.routes.test.js
git commit -m "feat(analyze): POST /api/lexical/analyze route + server wiring"
```

---

### Task 4: Client hook `useLexicalAnalyze` (submit-only)

**Files:**
- Create: `src/pages/Read/useLexicalAnalyze.js`

**Interfaces:**
- Produces: `useLexicalAnalyze() -> { result, loading, error, submit(query), clear() }`. `submit` is the ONLY thing that fetches. Relative URL `/api/lexical/analyze` (same-origin law).

- [ ] **Step 1: Implement the hook**

```js
// src/pages/Read/useLexicalAnalyze.js
import { useCallback, useRef, useState } from 'react';

export function useLexicalAnalyze() {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const submit = useCallback(async (query) => {
    const q = String(query || '').trim();
    if (!q) return;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/lexical/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: q }),
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`Analyze failed (${res.status})`);
      setResult(await res.json());
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message || 'Analyze failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => { abortRef.current?.abort(); setResult(null); setError(null); }, []);
  return { result, loading, error, submit, clear };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/pages/Read/useLexicalAnalyze.js
git commit -m "feat(analyze): submit-only client hook useLexicalAnalyze"
```

---

### Task 5: `AnalyzePanel` UI (query bar + groups + empty states)

**Files:**
- Create: `src/pages/Read/AnalyzePanel.jsx`, `src/pages/Read/AnalyzePanel.css`

**Interfaces:**
- Consumes: `useLexicalAnalyze` (Task 4).
- Produces: `<AnalyzePanel initialQuery? onCraftAction?={({ action, item }) => void} />`. `action ∈ 'insert'|'replace'|'pin'`. Craft-action wiring lands in Task 6; here the buttons call `onCraftAction`.

- [ ] **Step 1: Implement the component**

```jsx
// src/pages/Read/AnalyzePanel.jsx
import { useState } from 'react';
import PropTypes from 'prop-types';
import { useLexicalAnalyze } from './useLexicalAnalyze.js';
import './AnalyzePanel.css';

export default function AnalyzePanel({ initialQuery = '', onCraftAction }) {
  const [query, setQuery] = useState(initialQuery);
  const { result, loading, error, submit, clear } = useLexicalAnalyze();

  const onSubmit = (e) => { e.preventDefault(); submit(query); }; // submit-only

  return (
    <div className="az-panel">
      <form className="az-search" onSubmit={onSubmit}>
        <input
          className="az-search__input" value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Analyze a word, phrase, or concept…" aria-label="Analyze query"
        />
        <button className="az-search__go" type="submit" disabled={loading || !query.trim()}>
          {loading ? '…' : 'Search'}
        </button>
        {result && <button type="button" className="az-search__clear" onClick={() => { setQuery(''); clear(); }}>×</button>}
      </form>

      {error && <div className="az-error">{error}</div>}
      {result && (
        <div className="az-groups">
          {result.groups.map((g) => (
            <section key={g.key} className="az-group">
              <h3 className="az-group__title">{g.label} <span className="az-group__count">{g.items.length}</span></h3>
              {g.items.length === 0 ? (
                <p className="az-empty">{g.emptyReason}</p>
              ) : (
                <ul className="az-list">
                  {g.items.map((it, i) => (
                    <li key={`${g.key}-${i}`} className={`az-item${it.derived ? ' az-item--derived' : ''}`}>
                      <span className="az-item__text">{it.text}</span>
                      <span className="az-item__meta">
                        <span className="az-chip" title={it.note || ''}>{it.source}</span>
                        {it.derived && <span className="az-chip az-chip--loose">loose</span>}
                      </span>
                      <span className="az-actions">
                        <button type="button" onClick={() => onCraftAction?.({ action: 'insert', item: it })} title="Insert at cursor">⤵</button>
                        <button type="button" onClick={() => onCraftAction?.({ action: 'replace', item: it })} title="Replace selection">⇄</button>
                        <button type="button" onClick={() => onCraftAction?.({ action: 'pin', item: it })} title="Pin">📌</button>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

AnalyzePanel.propTypes = {
  initialQuery: PropTypes.string,
  onCraftAction: PropTypes.func,
};
```

- [ ] **Step 2: Add CSS** — `src/pages/Read/AnalyzePanel.css` matching the right-panel dark aesthetic (reuse variables from `AnalysisPanel.css`):

```css
.az-panel { display: flex; flex-direction: column; gap: 0.75rem; padding: 0.75rem; }
.az-search { display: flex; gap: 0.4rem; }
.az-search__input { flex: 1; background: #0f0f16; color: #f1ead8; border: 1px solid #2a2a3a; border-radius: 4px; padding: 0.45rem 0.6rem; font: inherit; }
.az-search__go { background: #2a2140; color: #d6b8ff; border: 1px solid #46356b; border-radius: 4px; padding: 0 0.8rem; cursor: pointer; }
.az-search__go:disabled { opacity: 0.5; cursor: default; }
.az-search__clear { background: none; border: none; color: #8a8fae; font-size: 1.1rem; cursor: pointer; }
.az-error { color: #ef8ea0; font-size: 0.85rem; }
.az-groups { display: flex; flex-direction: column; gap: 0.6rem; }
.az-group__title { font-size: 0.8rem; letter-spacing: 0.04em; text-transform: uppercase; color: #c9a840; margin: 0.3rem 0; }
.az-group__count { color: #6b6b80; }
.az-empty { color: #6b6b80; font-size: 0.8rem; font-style: italic; margin: 0.1rem 0 0.4rem; }
.az-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.2rem; }
.az-item { display: grid; grid-template-columns: 1fr auto auto; align-items: center; gap: 0.4rem; padding: 0.25rem 0.35rem; border-radius: 4px; }
.az-item:hover { background: #16161f; }
.az-item--derived .az-item__text { color: #b9b2c8; }
.az-chip { font-size: 0.65rem; color: #8a8fae; border: 1px solid #2a2a3a; border-radius: 3px; padding: 0 0.25rem; }
.az-chip--loose { color: #d2a15a; border-color: #4a3a22; }
.az-actions button { background: none; border: none; color: #8a8fae; cursor: pointer; padding: 0 0.15rem; }
.az-actions button:hover { color: #d6b8ff; }
```

- [ ] **Step 3: Commit**

```bash
git add src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css
git commit -m "feat(analyze): AnalyzePanel UI (submit-only, 8 groups, honest empties)"
```

---

### Task 6: Craft actions wired to the editor + pin list

**Files:**
- Modify: `src/pages/Read/AnalyzePanel.jsx` (pin state + pin strip)
- Modify: `src/pages/Read/ReadPage.jsx` (provide the `onCraftAction` handler)

**Interfaces:**
- Consumes: the Read IDE's Lexical editor handle. Insert/replace use the standard Lexical pattern via the editor instance already available in ReadPage (the same one TrueSight plugins use). Confirm the editor ref/name by reading ReadPage before writing the handler — do not invent a ref name.

- [ ] **Step 1: Add a pin strip to AnalyzePanel** — track pins in local state; when a `pin` action arrives, append (deduped by `text`); render a `.az-pins` strip above the groups with removable chips. Pins persist for the panel's mount lifetime only.

```jsx
// inside AnalyzePanel, add:
const [pins, setPins] = useState([]);
const handleAction = ({ action, item }) => {
  if (action === 'pin') { setPins((p) => (p.some((x) => x.text === item.text) ? p : [...p, item])); return; }
  onCraftAction?.({ action, item });
};
// render before .az-groups:
{pins.length > 0 && (
  <div className="az-pins">
    {pins.map((p) => (
      <span key={p.text} className="az-pin">
        {p.text}
        <button type="button" onClick={() => onCraftAction?.({ action: 'insert', item: p })} title="Insert">⤵</button>
        <button type="button" onClick={() => setPins((x) => x.filter((y) => y.text !== p.text))} title="Unpin">×</button>
      </span>
    ))}
  </div>
)}
```
Wire `onCraftAction={handleAction}` on every result button (replace the direct `onCraftAction?.` calls with `handleAction`).

- [ ] **Step 2: Implement the editor handler in ReadPage** — locate the Lexical editor instance in `ReadPage.jsx` (search for `editor` / `LexicalComposer` / `EditorRefPlugin` / the ref TrueSight uses). Add:

```jsx
const handleAnalyzeCraft = useCallback(({ action, item }) => {
  const editor = editorRef.current; // use the actual ref name found in ReadPage
  if (!editor || action === 'pin') return;
  editor.update(() => {
    const selection = $getSelection();               // import from 'lexical'
    if (!selection) return;
    if (action === 'replace' && !selection.isCollapsed()) selection.insertText(item.text);
    else selection.insertText(item.text);
  });
}, []);
```
Add `import { $getSelection } from 'lexical';` if not present.

- [ ] **Step 3: Manual verification** — in the running app, submit a query, click Insert (text appears at cursor), select a word and click Replace (selection swapped), click Pin (chip appears; its Insert works). Confirm before committing.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Read/AnalyzePanel.jsx src/pages/Read/ReadPage.jsx
git commit -m "feat(analyze): craft actions (insert/replace/pin) wired to the editor"
```

---

### Task 7: Mount AnalyzePanel in Analyze mode

**Files:**
- Modify: `src/pages/Read/ReadPage.jsx`

**Interfaces:**
- Consumes: `AnalyzePanel`, `handleAnalyzeCraft` (Task 6), existing `isAnalyzeMode`/`isAstrologyMode` flags.

- [ ] **Step 1: Import** — `import AnalyzePanel from './AnalyzePanel.jsx';` at the top of ReadPage.

- [ ] **Step 2: Branch the panel render** — at the `AnalysisPanel` render site (~line 1520, inside `{isAnalysisPanelVisible && (…)}`), render `AnalyzePanel` for Analyze mode and keep `AnalysisPanel` for Astrology:

```jsx
{isAnalyzeMode ? (
  <AnalyzePanel initialQuery={currentLineText?.split(/\s+/)[0] || ''} onCraftAction={handleAnalyzeCraft} />
) : (
  <AnalysisPanel /* …existing props unchanged… */ />
)}
```
Apply the same branch to the second (narrow-viewport) render site (~line 1720).

- [ ] **Step 3: Typecheck / lint**

Run: `npx tsc --noEmit -p tsconfig.json 2>&1 | grep -iE "ReadPage|AnalyzePanel" || echo clean`
Expected: `clean`.

- [ ] **Step 4: Commit**

```bash
git add src/pages/Read/ReadPage.jsx
git commit -m "feat(analyze): render AnalyzePanel in Read IDE Analyze mode"
```

---

### Task 8: Headed end-to-end verification

**Files:** none (verification only).

- [ ] **Step 1: Drive the Read IDE Analyze mode** with Playwright (headed per this repo's law): open Read, switch to Analyze mode, type `dark`, press Enter.

- [ ] **Step 2: Assert** the panel shows non-empty Meaning/Sound/Related groups, Oppositions + Phrases show their honest-empty placeholders, and Symbols items carry the `loose` chip. Assert **no** network call to `/api/lexical/analyze` fired on keystroke (only on submit) — record requests and check timing.

- [ ] **Step 3: Assert craft actions** — Insert puts text at the cursor; Pin adds a chip.

- [ ] **Step 4: Screenshot** to `scratchpad/analyze-panel.png` and eyeball it.

- [ ] **Step 5: Final commit** if any verification fixups were needed.

---

## Self-Review notes

- **Spec coverage:** Meaning/Related/Sound/Literary/Corpus/Symbols/Oppositions/Phrases → Task 2; craft actions → Task 6; submit-only → Tasks 4/5/8; route → Task 3; Astrology preserved → Task 7; honest-empty + derived flags → Task 2 tests.
- **Known risk:** the exact return shapes of `lexiconAdapter.lookupWord`/`lookupSlantRhymes` and the `lexicalGraphAdapter` device row fields (`canonicalText`/`name`/`slug`) must be confirmed against the adapters during Task 2 (fields are read defensively with fallbacks; do not invent). The editor ref name in Task 6 must be read from ReadPage, not assumed.
