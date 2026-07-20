# Multi-Candidate Lemmatization with Semantic Ballistics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Read IDE Analyze resolve a surface form to every lawful lemma/POS candidate, rank the closed candidate set against an explicit context envelope, and preserve ambiguity when evidence or morphology coverage is incomplete.

**Architecture:** A versioned offline `lemma_form` index nominates candidates; a domain-neutral candidate lattice validates and assesses margins; sense-level TurboQuant ballistics and traced morphology/POS/corpus channels rank only those candidates. The server owns context validation/hash/cache identity, and the UI submits only the visibly selected context scope while presenting shared groups separately from candidate-specific groups.

**Tech Stack:** Node 20.20.2, JavaScript/TypeScript ESM, Fastify 5, Zod 4, SQLite/better-sqlite3, TurboQuant JS, React 18, Lexical 0.45, Vitest 4, Testing Library, Playwright.

## Global Constraints

- Source design: `docs/superpowers/specs/2026-07-18-multi-candidate-lemmatization-design.md` at commits `92d9e6bc` and `067a0e49`.
- Submit-only: no request fires on query or editor keystrokes.
- Closed world: semantic proximity may rank `lemma_form` candidates and may never create one.
- Word scope uses only morphology `0.80` and corpus prior `0.20`; it emits no semantic or contextual-POS evidence or degradation.
- Contextual scopes use morphology `0.40`, semantic ballistics `0.40`, contextual POS `0.15`, and corpus prior `0.05` with missing-channel renormalization.
- `LEMMA_RANK_v1` margins are word `0.20`, selection `0.12`, line `0.12`, local `0.10`, document `0.10`.
- One candidate is `clear` only when the morphology manifest is `complete`, version-matching, and source-current; otherwise it is `ambiguous` with margin `0.0`.
- Server computes `sha256-canonical-v1:<64 lowercase hex>` over `ANALYSIS_CONTEXT_v1`, scope, surface, and only fields lawful for that scope.
- Text hashing uses Unicode NFC and LF line endings while preserving case, punctuation, whitespace, and neighbor ordering.
- Input caps: surface 80; selection 1,000; containing line 2,000; 1–4 neighboring lines of 2,000; document 20,000 characters.
- Missing or incompatible evidence degrades explicitly; it is never converted to score zero.
- Analyze results contain no `generatedAt`.
- Preserve unrelated dirty-worktree changes; before each edit run `git diff -- <target>` and stage only task files.
- Acquire collab locks before edits and include a call-center note on every task update.
- Ownership: Codex changes schemas/contracts and Core architecture; Gemini implements backend/Core details and tests; Claude implements `src/pages`, `src/components`, CSS, and visual baselines. Cross-owner tasks are explicit handoffs, not silent edits.

---

## File Structure

### New Core files

- `codex/core/candidate-lattice/index.ts` — generic closed-world validation, stable ordering, and top-two margin assessment.
- `codex/core/lexical-analysis/context.js` — strict scope validation, canonicalization, and server context hashing.
- `codex/core/lexical-analysis/morphology.js` — forward morphology rules, curated irregular edges, candidate IDs, and morphology constants.
- `codex/core/lexical-analysis/buildLemmaForms.js` — transactional offline inverse-index builder and complete/partial manifest writes.
- `codex/core/lexical-analysis/semanticBallistics.js` — compatible sense/context TurboQuant signatures, similarity, and QBIT trace IDs.
- `codex/core/lexical-analysis/lemmaRanker.js` — `LEMMA_RANK_v1` channel normalization, stable ranking, health-aware margin status.
- `codex/core/lexical-analysis/types.js` — JSDoc mirror for the new schema-contract types.

### New adapter/UI files

- `codex/server/adapters/lemma.sqlite.adapter.js` — read-only form, manifest, sense, and corpus-prior queries.
- `src/pages/Read/analysisContext.js` — browser-side construction of the selected request union; no hashing.
- `tests/core/candidate-lattice/index.test.ts`
- `tests/core/lexical-analysis/context.test.js`
- `tests/core/lexical-analysis/morphology.test.js`
- `tests/core/lexical-analysis/semanticBallistics.test.js`
- `tests/core/lexical-analysis/lemmaRanker.test.js`
- `tests/server/lemma.sqlite.adapter.test.js`
- `tests/pages/Read/analysisContext.test.js`
- `tests/pages/Read/AnalyzePanel.test.jsx`
- `tests/pages/Read/useLexicalAnalyze.test.jsx`

### Modified files

- `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`
- `codex/core/lexical-graph/types.js`
- `codex/core/lexical-graph/schema.sql.js`
- `codex/core/semantic-calculus/proposer.ts`
- `scripts/lexical-graph.mjs`
- `codex/server/services/lexicalAnalyze.service.js`
- `codex/server/routes/lexicalAnalyze.routes.js`
- `codex/server/index.js`
- `src/lib/lexical/LexicalScrollEditor.jsx`
- `src/pages/Read/useLexicalAnalyze.js`
- `src/pages/Read/AnalyzePanel.jsx`
- `src/pages/Read/AnalyzePanel.css`
- `src/pages/Read/ReadPage.jsx`
- existing lexical-graph, semantic-calculus, Analyze service, route, and visual tests listed in the tasks below.

---

### Task 1: Ratify schemas and deterministic context identity

**Owner:** Codex

**Files:**
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md:1-185`
- Modify: `codex/core/lexical-graph/types.js:1-15`
- Create: `codex/core/lexical-analysis/types.js`
- Create: `codex/core/lexical-analysis/context.js`
- Create: `tests/core/lexical-analysis/context.test.js`

**Interfaces:**
- Consumes: raw `AnalysisContextInput` discriminated union.
- Produces: `resolveAnalysisContext(input): AnalysisContext`, `canonicalContextBytes(input): string`, constants `ANALYSIS_CONTEXT_VERSION` and `CONTEXT_HASH_ALGORITHM`.

- [ ] **Step 1: Write the failing context tests**

```js
import { describe, expect, it } from 'vitest';
import { resolveAnalysisContext } from '../../../codex/core/lexical-analysis/context.js';

describe('ANALYSIS_CONTEXT_v1', () => {
  it('hashes NFC and LF-equivalent line contexts identically', () => {
    const a = resolveAnalysisContext({ scope: 'line', surface: 'café', containingLine: 'I saw cafe\u0301\r\n' });
    const b = resolveAnalysisContext({ scope: 'line', surface: 'café', containingLine: 'I saw café\n' });
    expect(a.contextHash).toBe(b.contextHash);
    expect(a.contextHash).toMatch(/^sha256-canonical-v1:[0-9a-f]{64}$/);
  });

  it('rejects fields outside the selected scope', () => {
    expect(() => resolveAnalysisContext({ scope: 'word', surface: 'saw', documentContext: 'secret draft' }))
      .toThrow(/PB-ERR-v1-VALUE/);
  });

  it('preserves neighbor order in local hashes', () => {
    const base = { scope: 'local', surface: 'saw', containingLine: 'I saw it' };
    const a = resolveAnalysisContext({ ...base, neighboringLines: ['before', 'after'] });
    const b = resolveAnalysisContext({ ...base, neighboringLines: ['after', 'before'] });
    expect(a.contextHash).not.toBe(b.contextHash);
  });

  it('enforces document and neighbor limits without truncation', () => {
    expect(() => resolveAnalysisContext({ scope: 'document', surface: 'saw', documentContext: 'x'.repeat(20001) }))
      .toThrow(/PB-ERR-v1-VALUE/);
    expect(() => resolveAnalysisContext({ scope: 'local', surface: 'saw', containingLine: 'x', neighboringLines: ['1', '2', '3', '4', '5'] }))
      .toThrow(/PB-ERR-v1-VALUE/);
  });
});
```

- [ ] **Step 2: Run the tests and verify the missing-module failure**

Run: `npx vitest run tests/core/lexical-analysis/context.test.js --reporter=verbose`

Expected: FAIL because `codex/core/lexical-analysis/context.js` does not exist.

- [ ] **Step 3: Add the schema notice and JSDoc contracts**

In `SCHEMA_CONTRACT.md`, bump `1.33` to `1.34`, add an additive change notice, and register the exact approved types: `AnalysisContextInput`, `AnalysisContextIdentity`, `MorphologyIndexState`, `LemmaForm`, `CandidateEvidence`, `SenseCandidate`, `LemmaCandidate`, `LemmaResolution`, `AnalysisDegradation`, `CandidateAnalyzeResult`, and `AnalyzeResult`. Record that `contextHash` is server-authored and `AnalyzeResult` has no wall-clock field.

In `types.js`, add:

```js
export const ANALYSIS_CONTEXT_VERSION = 'ANALYSIS_CONTEXT_v1';
export const CONTEXT_HASH_ALGORITHM = 'sha256-canonical-v1';
export const MORPHOLOGY_VERSION = 'LEMMA_FORM_v1';
export const LEMMA_RANK_FORMULA_VERSION = 'LEMMA_RANK_v1';
```

- [ ] **Step 4: Implement strict resolution and hashing**

```js
import { createHash } from 'node:crypto';
import { ANALYSIS_CONTEXT_VERSION, CONTEXT_HASH_ALGORITHM } from '../lexical-graph/types.js';

const LIMITS = Object.freeze({ surface: 80, selection: 1000, containingLine: 2000, neighboringLine: 2000, documentContext: 20000 });
const FIELDS = Object.freeze({
  word: ['scope', 'surface'],
  selection: ['scope', 'surface', 'selection'],
  line: ['scope', 'surface', 'containingLine'],
  local: ['scope', 'surface', 'containingLine', 'neighboringLines'],
  document: ['scope', 'surface', 'documentContext'],
});

const normalize = (value) => String(value).normalize('NFC').replace(/\r\n?/g, '\n');
const fail = (message) => { throw new Error(`PB-ERR-v1-VALUE: ${message}`); };

export function resolveAnalysisContext(input) {
  if (!input || !FIELDS[input.scope]) fail('invalid analysis scope');
  const allowed = new Set(FIELDS[input.scope]);
  for (const key of Object.keys(input)) if (!allowed.has(key)) fail(`field ${key} forbidden for ${input.scope}`);
  const surface = normalize(input.surface ?? '').trim();
  if (!surface || surface.length > LIMITS.surface) fail('surface length');
  const body = { version: ANALYSIS_CONTEXT_VERSION, scope: input.scope, surface };
  for (const key of FIELDS[input.scope].slice(2)) {
    if (key === 'neighboringLines') {
      if (!Array.isArray(input[key]) || input[key].length < 1 || input[key].length > 4) fail('neighboringLines length');
      body[key] = input[key].map((line) => {
        const value = normalize(line);
        if (!value || value.length > LIMITS.neighboringLine) fail('neighboring line length');
        return value;
      });
    } else {
      const value = normalize(input[key] ?? '');
      if (!value || value.length > LIMITS[key]) fail(`${key} length`);
      body[key] = value;
    }
  }
  const canonical = JSON.stringify(body);
  const digest = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return Object.freeze({ ...body, contextHash: `${CONTEXT_HASH_ALGORITHM}:${digest}` });
}

export function canonicalContextBytes(input) {
  const { contextHash: _contextHash, ...body } = resolveAnalysisContext(input);
  return JSON.stringify(body);
}
```

- [ ] **Step 5: Verify context tests and commit**

Run: `npx vitest run tests/core/lexical-analysis/context.test.js --reporter=verbose`

Expected: PASS, 4 tests.

```bash
git add docs/scholomance-encyclopedia/Scholomance\ LAW/SCHEMA_CONTRACT.md codex/core/lexical-graph/types.js codex/core/lexical-analysis/types.js codex/core/lexical-analysis/context.js tests/core/lexical-analysis/context.test.js
git commit -m "feat(analyze): ratify deterministic analysis context"
```

---

### Task 2: Extract the domain-neutral candidate lattice

**Owner:** Codex contract; Gemini tests and implementation verification

**Files:**
- Create: `codex/core/candidate-lattice/index.ts`
- Create: `tests/core/candidate-lattice/index.test.ts`
- Modify: `codex/core/semantic-calculus/proposer.ts:43-105`
- Test: `tests/semantic-calculus/margin.law.test.js`

**Interfaces:**
- Produces `validateClosedCandidates(candidates, known, errors): void`, `stableCandidates(candidates)`, and `assessCandidateMargin(candidates, threshold)`.
- Preserves Semantic Calculus exports and `MarginVerdict` behavior through wrappers.

- [ ] **Step 1: Write generic lattice tests**

```ts
import { describe, expect, it } from 'vitest';
import { assessCandidateMargin, stableCandidates, validateClosedCandidates } from '../../../codex/core/candidate-lattice/index.ts';

describe('candidate lattice', () => {
  it('rejects invented keys and invalid scores', () => {
    expect(() => validateClosedCandidates([{ key: 'x', score: 0.5 }], ['a'], { invented: 'INVENTED', invalidScore: 'BAD_SCORE' })).toThrow('INVENTED');
    expect(() => validateClosedCandidates([{ key: 'a', score: 2 }], ['a'], { invented: 'INVENTED', invalidScore: 'BAD_SCORE' })).toThrow('BAD_SCORE');
  });

  it('orders ties by key and exposes thin margins', () => {
    expect(stableCandidates([{ key: 'b', score: 0.6 }, { key: 'a', score: 0.6 }]).map((x) => x.key)).toEqual(['a', 'b']);
    expect(assessCandidateMargin([{ key: 'a', score: 0.61 }, { key: 'b', score: 0.6 }], 0.15)).toMatchObject({ status: 'thin', margin: 0.01 });
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/core/candidate-lattice/index.test.ts --reporter=verbose`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the generic primitive**

```ts
export interface RankedCandidate { key: string; score: number; why?: string }

export function stableCandidates<T extends RankedCandidate>(candidates: readonly T[]): T[] {
  return [...candidates].sort((a, b) => b.score - a.score || a.key.localeCompare(b.key));
}

export function validateClosedCandidates(
  candidates: readonly RankedCandidate[],
  known: readonly string[],
  errors: { invented: string; invalidScore: string },
): void {
  const closed = new Set(known);
  for (const candidate of candidates) {
    if (!closed.has(candidate.key)) throw new Error(`${errors.invented}: ${JSON.stringify(candidate.key)}`);
    if (!Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) {
      throw new Error(`${errors.invalidScore}: ${candidate.key}=${candidate.score}`);
    }
  }
}

export function assessCandidateMargin(candidates: readonly RankedCandidate[], threshold: number) {
  const ranked = stableCandidates(candidates);
  if (ranked.length === 0) return { status: 'empty' as const, margin: 0, ranked };
  if (ranked.length === 1) return { status: 'single' as const, margin: ranked[0].score, ranked };
  const margin = ranked[0].score - ranked[1].score;
  return { status: margin >= threshold ? 'clear' as const : 'thin' as const, margin, ranked };
}
```

- [ ] **Step 4: Refactor `proposer.ts` to wrap the primitive without API drift**

Import the three functions. Replace internal validation/sorting while keeping `validateProposal`, `assessMargin`, error strings, and result reasons unchanged. Map `single` to `sole-candidate`, `clear` to `clear-margin`, and `thin` to `thin-margin`.

- [ ] **Step 5: Verify generic and semantic-calculus parity, then commit**

Run: `npx vitest run tests/core/candidate-lattice/index.test.ts tests/semantic-calculus/margin.law.test.js --reporter=verbose`

Expected: both suites PASS.

```bash
git add codex/core/candidate-lattice/index.ts tests/core/candidate-lattice/index.test.ts codex/core/semantic-calculus/proposer.ts
git commit -m "refactor(core): share closed candidate lattice"
```

---

### Task 3: Add the morphology schema, rules, and complete-manifest builder

**Owner:** Codex schema; Gemini implementation/tests

**Files:**
- Modify: `codex/core/lexical-graph/schema.sql.js`
- Modify: `codex/core/lexical-graph/migrate.js`
- Create: `codex/core/lexical-analysis/morphology.js`
- Create: `codex/core/lexical-analysis/buildLemmaForms.js`
- Create: `tests/core/lexical-analysis/morphology.test.js`
- Modify: `tests/server/lexicalGraph.migrate.test.js`

**Interfaces:**
- Produces `forwardLemmaForms(lemma, pos): LemmaForm[]`, `candidateId(lemma, pos): string`, and `buildLemmaForms(db, { timestamp }): MorphologyIndexState`.
- Persists `lemma_form` and manifest meta keys transactionally.

- [ ] **Step 1: Add failing morphology rule tests**

```js
import { describe, expect, it } from 'vitest';
import { forwardLemmaForms } from '../../../codex/core/lexical-analysis/morphology.js';

const surfaces = (lemma, pos) => forwardLemmaForms(lemma, pos).map((row) => row.surface);

describe('LEMMA_FORM_v1 forward rules', () => {
  it('emits identity and ambiguous plural forms', () => {
    expect(surfaces('ax', 'n')).toContain('axes');
    expect(surfaces('axis', 'n')).toContain('axes');
    expect(surfaces('leaf', 'n')).toContain('leaves');
    expect(surfaces('leave', 'v')).toContain('leaves');
  });

  it('emits sourced irregulars', () => {
    expect(surfaces('see', 'v')).toContain('saw');
    expect(surfaces('go', 'v')).toContain('went');
    expect(surfaces('good', 'a')).toContain('better');
    expect(surfaces('well', 'r')).toContain('better');
  });
});
```

- [ ] **Step 2: Add failing migration assertions**

Extend `OVERLAY_TABLES` with `lemma_form`; assert the unique key rejects an exact duplicate, accepts `axes -> ax/n` and `axes -> axis/n`, and assert all five manifest meta keys are absent immediately after migration.

Run: `npx vitest run tests/core/lexical-analysis/morphology.test.js tests/server/lexicalGraph.migrate.test.js --reporter=verbose`

Expected: FAIL for the missing morphology module/table.

- [ ] **Step 3: Add the additive DDL**

```sql
CREATE TABLE IF NOT EXISTS lemma_form (
  surface_lower TEXT NOT NULL,
  lemma_lower TEXT NOT NULL,
  pos TEXT NOT NULL,
  transform_id TEXT NOT NULL,
  source TEXT NOT NULL,
  irregular INTEGER NOT NULL CHECK (irregular IN (0, 1)),
  morphological_confidence REAL NOT NULL CHECK (morphological_confidence BETWEEN 0 AND 1),
  PRIMARY KEY (surface_lower, lemma_lower, pos, transform_id, source)
);

CREATE INDEX IF NOT EXISTS idx_lemma_form_surface
  ON lemma_form(surface_lower, lemma_lower, pos);
```

- [ ] **Step 4: Implement forward rules and curated irregular registry**

Implement identity `1.0`, sourced irregular `1.0`, curated irregular `0.95`, and productive rule `0.85`. Include noun `s/x/z/ch/sh -> es`, consonant `y -> ies`, `is -> es`, `f/fe -> ves`; verb third-person equivalents plus `ed`/`ing`; and the approved irregular entries for `see/saw`, `go/went`, `good/better`, and `well/better`. Deduplicate by the persisted composite key and sort by surface, lemma, POS, transform ID, source.

- [ ] **Step 5: Implement the transactional builder and manifest**

The builder must:

1. Read sorted distinct `(lemma_lower, pos)` from `wordnet_lemma`, union legacy `entry` rows with non-empty POS.
2. Compute `sourceDigest` from `MORPHOLOGY_VERSION` plus the sorted source pairs.
3. In a short committed preflight transaction, set `lemma_form_status=partial` and remove the four completeness fields. This marker must survive an interrupted rebuild.
4. In a separate rebuild transaction, delete and insert every deduplicated edge, verify the indexed count, and roll back every row change on failure.
5. After the rebuild transaction commits, atomically write version, digest, expected/indexed counts, and finally `lemma_form_status=complete`.
6. On failure, retain the committed `partial` marker, retain no partially rebuilt row set, and never expose a complete manifest for the failed source digest.

- [ ] **Step 6: Add fixture builder tests and verify**

Create `tests/core/lexical-analysis/buildLemmaForms.test.js` with a temporary DB containing `ax`, `axis`, `leaf`, `leave`, `saw`, `see`; assert both `axes` candidates, both `leaves` candidates, complete counts, stable digest, idempotence, and rollback on injected failure.

Run: `npx vitest run tests/core/lexical-analysis/morphology.test.js tests/core/lexical-analysis/buildLemmaForms.test.js tests/server/lexicalGraph.migrate.test.js --reporter=verbose`

Expected: PASS.

```bash
git add codex/core/lexical-graph/schema.sql.js codex/core/lexical-graph/migrate.js codex/core/lexical-analysis/morphology.js codex/core/lexical-analysis/buildLemmaForms.js tests/core/lexical-analysis/morphology.test.js tests/core/lexical-analysis/buildLemmaForms.test.js tests/server/lexicalGraph.migrate.test.js
git commit -m "feat(dict): add inverse morphology index"
```

---

### Task 4: Add the offline morphology CLI command

**Owner:** Gemini

**Files:**
- Modify: `scripts/lexical-graph.mjs`
- Modify: `tests/server/lexicalGraph.cli.test.js`
- Modify: `tests/server/lexicalGraph.all.test.js`

**Interfaces:**
- Consumes `buildLemmaForms(db, { timestamp })`.
- Produces `build-lemma-forms` CLI command and adds `lemmaForms` count to `all`.

- [ ] **Step 1: Write failing CLI tests**

Add a fixture DB with the required `entry`, `wordnet_lemma`, `wordnet_synset`, and `meta` tables. Assert:

```js
const code = await runCli(['build-lemma-forms', '--db', dbPath, '--timestamp', NOW]);
expect(code).toBe(0);
expect(db.prepare("SELECT value FROM meta WHERE key='lemma_form_status'").get().value).toBe('complete');
```

Also assert `runLexicalGraphAll` returns `{ mirrored, seeded, embedded, lemmaForms }` and leaves the manifest complete.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/server/lexicalGraph.cli.test.js tests/server/lexicalGraph.all.test.js --reporter=verbose`

Expected: FAIL because the command is unknown and `all` lacks `lemmaForms`.

- [ ] **Step 3: Wire the command**

Import `buildLemmaForms`, add `build-lemma-forms` to `USAGE` and `WRITE_COMMANDS`, return the indexed count in `runLexicalGraphAll`, and add the explicit command branch:

```js
if (command === 'build-lemma-forms') {
  migrateLexicalGraph(db, { timestamp: options.timestamp });
  const state = buildLemmaForms(db, { timestamp: options.timestamp });
  console.log(`lexical-graph build-lemma-forms: indexed ${state.indexedLemmaCount} lemmas on ${options.db}`);
  return 0;
}
```

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/server/lexicalGraph.cli.test.js tests/server/lexicalGraph.all.test.js --reporter=verbose`

Expected: PASS.

```bash
git add scripts/lexical-graph.mjs tests/server/lexicalGraph.cli.test.js tests/server/lexicalGraph.all.test.js
git commit -m "feat(dict): expose lemma-form build command"
```

---

### Task 5: Add the read-only lemma adapter

**Owner:** Gemini

**Files:**
- Create: `codex/server/adapters/lemma.sqlite.adapter.js`
- Create: `tests/server/lemma.sqlite.adapter.test.js`

**Interfaces:**
- Produces `createLemmaAdapter(dbPath, options)` with `lookupForms(surface)`, `getIndexState()`, `lookupSenses(lemma, pos)`, `getCorpusFrequencies(lemmas)`, and `close()`.

- [ ] **Step 1: Write adapter fixture tests**

Use a temporary SQLite fixture built by Tasks 3–4. Assert:

```js
expect(adapter.lookupForms('Axes').map((x) => `${x.lemma}/${x.pos}`)).toEqual(['ax/n', 'axis/n']);
expect(adapter.getIndexState()).toMatchObject({ version: 'LEMMA_FORM_v1', status: 'complete' });
expect(adapter.lookupSenses('see', 'v')[0]).toEqual(expect.objectContaining({ synsetId: expect.any(String), definition: expect.any(String) }));
expect(adapter.getCorpusFrequencies(['saw', 'see'])).toBeInstanceOf(Map);
```

Add degraded fixtures for missing DB, missing manifest, partial manifest, and stale version.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/server/lemma.sqlite.adapter.test.js --reporter=verbose`

Expected: FAIL because the adapter does not exist.

- [ ] **Step 3: Implement bounded read-only queries**

Open with `{ readonly: true, fileMustExist: true }`, set `query_only=ON`, and use prepared statements. Normalize OEWN POS codes without collapsing identity: `n -> noun`, `v -> verb`, `a/s -> adjective`, `r -> adverb`. Return manifest `partial` when any required meta key is missing or version/digest/count checks fail. Never infer completeness from candidate count.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/server/lemma.sqlite.adapter.test.js --reporter=verbose`

Expected: PASS.

```bash
git add codex/server/adapters/lemma.sqlite.adapter.js tests/server/lemma.sqlite.adapter.test.js
git commit -m "feat(server): read lemma candidates and manifest"
```

---

### Task 6: Implement sense ballistics and health-aware lemma ranking

**Owner:** Codex interfaces; Gemini implementation/tests

**Files:**
- Create: `codex/core/lexical-analysis/semanticBallistics.js`
- Create: `codex/core/lexical-analysis/lemmaRanker.js`
- Create: `tests/core/lexical-analysis/semanticBallistics.test.js`
- Create: `tests/core/lexical-analysis/lemmaRanker.test.js`

**Interfaces:**
- Produces `scoreSenseBallistics(contextText, senses)`, `rankLemmaCandidates({ context, forms, sensesByCandidate, frequencies, morphologyIndex })`.
- Consumes candidate-lattice margin primitive and TurboQuant JS.

- [ ] **Step 1: Write failing ballistic compatibility tests**

```js
it('scores compatible sense signatures and refuses metadata mismatch', () => {
  const result = scoreSenseBallistics('cut wood with the saw', [
    { synsetId: 'tool', definition: 'a tool used to cut wood', examples: [] },
  ]);
  expect(result.senses[0].semanticScore).toBeGreaterThan(0.5);
  expect(result.senses[0].bucketIds).toHaveLength(4);
  expect(result.embedding).toMatchObject({ kind: 'phonosemantic_mock', version: 'tq-js-v1', dimensions: 256 });
});
```

Export `compareBallisticSignatures(contextSignature, senseSignature)` as the metadata gate. Inject an incompatible signature into that function and assert the score is absent with degradation `embedding_metadata_mismatch`; `scoreSenseBallistics` uses the same gate for every generated sense signature.

- [ ] **Step 2: Write failing ranker tests**

Cover:

```js
expect(rankWord.evidence.some((e) => e.channel === 'semantics' || e.channel === 'pos')).toBe(false);
expect(singleComplete.status).toBe('clear');
expect(singlePartial).toMatchObject({ status: 'ambiguous', margin: 0 });
expect(contextualClear.candidates.map((x) => x.lemma)).toEqual(['see', 'saw']);
expect(contextualThin.status).toBe('ambiguous');
```

- [ ] **Step 3: Verify RED**

Run: `npx vitest run tests/core/lexical-analysis/semanticBallistics.test.js tests/core/lexical-analysis/lemmaRanker.test.js --reporter=verbose`

Expected: FAIL because both modules are missing.

- [ ] **Step 4: Implement semantic ballistics**

Use `generatePhonosemanticVector(text, 256)`, `quantizeVectorJS(vector, 42)`, and `estimateInnerProduct(dataA, dataB, 1, 1)`. Sense text is `${lemma}\n${pos}\n${definition}\n${examples.join('\n')}`. Normalize similarity with `(cosine + 1) / 2`. Produce four trace-only bucket IDs by FNV-1a hashing four equal consecutive packed-data bands; bucket IDs never participate in candidate admission or score.

- [ ] **Step 5: Implement `LEMMA_RANK_v1`**

Use the exact Global Constraints weights and thresholds. For each candidate:

- morphology score = maximum form-edge confidence, retaining all edge evidence;
- semantic score = maximum compatible sense score for non-word scopes;
- POS score = deterministic trigger evidence when available, absent otherwise;
- corpus score = `log1p(freq) / log1p(maxCandidateFreq)`, absent if all frequencies are missing;
- missing channels are removed from the denominator;
- tie order = score descending, lemma, POS, candidate ID;
- API score precision = six decimals.

Call `assessCandidateMargin`, then override `single` to `ambiguous/margin=0` unless `morphologyIndex.status === 'complete'` and its version/source/count checks are healthy.

- [ ] **Step 6: Verify and commit**

Run: `npx vitest run tests/core/lexical-analysis/semanticBallistics.test.js tests/core/lexical-analysis/lemmaRanker.test.js --reporter=verbose`

Expected: PASS.

```bash
git add codex/core/lexical-analysis/semanticBallistics.js codex/core/lexical-analysis/lemmaRanker.js tests/core/lexical-analysis/semanticBallistics.test.js tests/core/lexical-analysis/lemmaRanker.test.js
git commit -m "feat(core): rank lemma candidates with ballistics"
```

---

### Task 7: Compose multi-candidate Analyze results

**Owner:** Gemini

**Files:**
- Modify: `codex/server/services/lexicalAnalyze.service.js`
- Modify: `tests/server/lexicalAnalyze.service.test.js`

**Interfaces:**
- Changes factory to `createLexicalAnalyzeService({ lexiconAdapter, lexicalGraphAdapter, lemmaAdapter, rankLemmaCandidates })`.
- Changes `analyze(context)` to consume a server-resolved `AnalysisContext` and return deterministic `AnalyzeResult`; direct service tests call `resolveAnalysisContext` explicitly.

- [ ] **Step 1: Replace service tests with the new contract first**

Use injected fixture adapters. Assert:

```js
const result = service.analyze(resolveAnalysisContext({ scope: 'line', surface: 'leaves', containingLine: 'The tree sheds its leaves' }));
expect(result).not.toHaveProperty('generatedAt');
expect(result.resolution.candidates.map((x) => `${x.lemma}/${x.pos}`)).toEqual(['leaf/noun', 'leave/verb']);
expect(result.sharedGroups.find((x) => x.key === 'sound')).toBeTruthy();
expect(result.candidateResults).toHaveLength(2);
expect(result.candidateResults[0].groups.map((x) => x.key)).toEqual(['meaning', 'related', 'oppositions', 'symbols', 'corpus']);
```

Add tests for word-scope channel absence, partial-manifest lone ambiguity, unknown surface, missing ballistics, literary context anchoring, and honest-empty groups.

- [ ] **Step 2: Verify RED against the old query-string service**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js --reporter=verbose`

Expected: FAIL because the service returns `{ query, canonical, generatedAt, groups }`.

- [ ] **Step 3: Refactor retrieval into explicit anchors**

Keep existing item provenance shapes. Implement:

- `surfaceGroups(surface)` -> Sound and Phrases;
- `candidateGroups(candidate)` -> Meaning, Related, Oppositions, Symbols, Corpus;
- `contextGroups(effectiveContext)` -> Literary Techniques.

Build `sharedGroups` in visible order and `candidateResults` keyed by stable candidate ID. Do not merge candidate items. For unbound morphology, return shared groups, empty `candidateResults`, and the morphology degradation.

- [ ] **Step 4: Verify and commit**

Run: `npx vitest run tests/server/lexicalAnalyze.service.test.js --reporter=verbose`

Expected: PASS.

```bash
git add codex/server/services/lexicalAnalyze.service.js tests/server/lexicalAnalyze.service.test.js
git commit -m "feat(analyze): compose candidate-specific retrieval"
```

---

### Task 8: Enforce the context union and versioned cache at the route

**Owner:** Gemini

**Files:**
- Modify: `codex/server/routes/lexicalAnalyze.routes.js`
- Modify: `tests/server/lexicalAnalyze.routes.test.js`
- Modify: `codex/server/index.js:71-74,226-229,1140-1143`

**Interfaces:**
- Route body becomes `{ context: AnalysisContextInput }`.
- Cache key consumes resolved context hash plus morphology/lexicon/embedding/lattice/formula versions.

- [ ] **Step 1: Write strict route and cache tests**

Add valid cases for all five scopes and invalid cases for extra fields, empty required values, five neighbors, and 20,001-character documents. Assert the service receives the server-resolved context including `contextHash`. Call the same request twice and assert one service call; vary `rankingFormulaVersion` and assert a miss.

- [ ] **Step 2: Verify RED**

Run: `npx vitest run tests/server/lexicalAnalyze.routes.test.js --reporter=verbose`

Expected: FAIL because the route accepts `{ query }` and hashes only lowercase query text.

- [ ] **Step 3: Implement strict Zod union and cache identity**

Use `.strict()` on every union member. Resolve through `resolveAnalysisContext`; encode PB-ERR VALUE responses for validation failures. Construct the cache material as:

```js
JSON.stringify({
  contextHash: context.contextHash,
  morphologyVersion: versions.morphologyVersion,
  lexiconVersion: versions.lexiconVersion,
  embeddingKind: versions.embeddingKind,
  embeddingVersion: versions.embeddingVersion,
  embeddingDimensions: versions.embeddingDimensions,
  latticeMapVersion: versions.latticeMapVersion,
  rankingFormulaVersion: versions.rankingFormulaVersion,
})
```

- [ ] **Step 4: Wire the lemma adapter in `server/index.js`**

Instantiate `createLemmaAdapter(SCHOLOMANCE_DICT_PATH, { log: fastify.log })`, pass it into the service, and pass a frozen `versions` object into the route. Register no new endpoint.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/server/lexicalAnalyze.routes.test.js tests/server/lexicalAnalyze.service.test.js tests/server/lemma.sqlite.adapter.test.js --reporter=verbose`

Expected: PASS.

```bash
git add codex/server/routes/lexicalAnalyze.routes.js tests/server/lexicalAnalyze.routes.test.js codex/server/index.js
git commit -m "feat(server): validate scoped Analyze context"
```

---

### Task 9: Add client context construction and submit-only transport

**Owner:** Gemini writes tests; Claude implements UI-owned files after the failing-test handoff

**UI SPEC:**
- Component: `AnalyzePanel` and Read-page context bridge.
- World-law connection: the visible scope is the consent seal controlling which words gain semantic mass in the analysis lattice.
- Data consumed: local editor selection/content/cursor; `POST /api/lexical/analyze` result from the registered schema.
- State: selected scope, query, selected candidate, pins, loading/error.
- Accessibility: labeled radiogroup, disabled unavailable scopes, keyboard candidate tabs, live ambiguity status.
- School theming: use existing Analyze CSS surface tokens; do not hardcode a new school palette.
- Animation: none required for the context bridge; candidate reveal respects reduced motion in Task 10.
- Regression risk: Read right panel, floating narrow-viewport Analyze panel, selection state, submit-only network law.

**Files:**
- Create: `src/pages/Read/analysisContext.js`
- Create: `tests/pages/Read/analysisContext.test.js`
- Create: `tests/pages/Read/useLexicalAnalyze.test.jsx`
- Modify: `src/pages/Read/useLexicalAnalyze.js`
- Modify: `src/lib/lexical/LexicalScrollEditor.jsx`
- Modify: `src/pages/Read/ReadPage.jsx`

**Interfaces:**
- Produces `buildAnalysisContextInput({ scope, surface, selection, lines, lineIndex, documentContext })`.
- `useLexicalAnalyze.submit(contextInput)` sends `{ context: contextInput }` only on explicit submit.
- `LexicalScrollEditor` reports current selection text to ReadPage.

- [ ] **Step 1: Gemini writes failing context-builder and hook tests**

Assert line, local, selection, document, and word payloads include only lawful fields. Mock `fetch`, type without submitting, and assert zero calls; call `submit` and assert exactly:

```js
expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
  context: { scope: 'line', surface: 'saw', containingLine: 'I saw the aurora' },
});
```

- [ ] **Step 2: Verify RED and hand off to Claude**

Run: `npx vitest run tests/pages/Read/analysisContext.test.js tests/pages/Read/useLexicalAnalyze.test.jsx --reporter=verbose`

Expected: FAIL for the missing builder and old `{ query }` body.

- [ ] **Step 3: Claude implements the pure browser builder**

`analysisContext.js` returns a new frozen object for each scope, takes two neighbors on each side for Local (maximum four), and never includes `documentContext` outside Document.

- [ ] **Step 4: Claude updates the hook and editor selection bridge**

Change `submit(query)` to `submit(contextInput)`. Add a small Lexical selection plugin using `SELECTION_CHANGE_COMMAND` and `$isRangeSelection` that calls `onSelectionTextChange(selection.getTextContent())`; clear to `''` for collapsed selection. Store selection text in ReadPage and pass `selection`, `currentLineText`, `scrollLines`, current zero-based line index, and document content to both AnalyzePanel render sites.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/pages/Read/analysisContext.test.js tests/pages/Read/useLexicalAnalyze.test.jsx tests/pages/read-scroll-editor.truesight.test.jsx --reporter=verbose`

Expected: PASS.

```bash
git add src/pages/Read/analysisContext.js tests/pages/Read/analysisContext.test.js tests/pages/Read/useLexicalAnalyze.test.jsx src/pages/Read/useLexicalAnalyze.js src/lib/lexical/LexicalScrollEditor.jsx src/pages/Read/ReadPage.jsx
git commit -m "feat(read): submit explicit Analyze context"
```

---

### Task 10: Render ambiguity, candidates, evidence, and anchored groups

**Owner:** Gemini writes component test; Claude implements UI/CSS/visual coverage

**Files:**
- Create: `tests/pages/Read/AnalyzePanel.test.jsx`
- Modify: `src/pages/Read/AnalyzePanel.jsx`
- Modify: `src/pages/Read/AnalyzePanel.css`
- Modify: `tests/visual/lexical-analyze.real.spec.js`

**Interfaces:**
- Consumes approved `AnalyzeResult` and context-source props from Task 9.
- Emits existing craft actions unchanged.

- [ ] **Step 1: Gemini writes the failing component behavior test**

Mock `useLexicalAnalyze`. Assert:

- scope controls are a labeled radiogroup;
- Selection is disabled when selection text is empty;
- Local shows included-neighbor count;
- Document shows the inline sovereignty notice before submit;
- candidate buttons expose lemma/POS/score;
- partial-index lone candidate announces ambiguous coverage;
- switching candidates changes candidate groups but not Sound/Literary shared groups;
- semantic/POS evidence is absent in Word scope;
- typing the query does not call `submit`.

- [ ] **Step 2: Verify RED and hand off to Claude**

Run: `npx vitest run tests/pages/Read/AnalyzePanel.test.jsx --reporter=verbose`

Expected: FAIL against the current flat `result.groups` panel.

- [ ] **Step 3: Claude implements the semantic surface**

Add:

- scope radiogroup `Word | Selection | Line | Local | Document`;
- inline document sovereignty notice;
- resolution status with morphology health;
- candidate tablist using stable candidate IDs;
- evidence disclosure per candidate;
- an assembled visible group order that inserts candidate Meaning/Related/Oppositions, shared Sound/Phrases/Literary, then candidate Symbols/Corpus;
- existing Insert/Replace/Pin actions for every item.

Use classes, not inline state styles. Preserve keyboard navigation and ARIA selected/controls relationships. Use `usePrefersReducedMotion`; when reduced motion is true, candidate changes render without transition.

- [ ] **Step 4: Update headed visual coverage**

Extend the real Analyze visual spec to submit `saw` in Word and Line scopes, capture the candidate strip and ambiguity state, and assert no request occurs before Search/Enter.

- [ ] **Step 5: Verify and commit**

Run: `npx vitest run tests/pages/Read/AnalyzePanel.test.jsx --reporter=verbose`

Run: `npx playwright test tests/visual/lexical-analyze.real.spec.js --project=chromium --workers=1 --reporter=line`

Expected: component and headed Analyze tests PASS.

```bash
git add tests/pages/Read/AnalyzePanel.test.jsx src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css tests/visual/lexical-analyze.real.spec.js
git commit -m "feat(read): surface lemma ambiguity evidence"
```

---

### Task 11: Build the live index, run the full gate, and write the PIR

**Owner:** Gemini verification/PIR; Codex schema audit; Claude visual confirmation

**Files:**
- Create: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260718-MULTI-CANDIDATE-LEMMATIZATION.md`

**Interfaces:**
- Consumes the complete feature.
- Produces a complete local morphology manifest, verification evidence, and PIR.

- [ ] **Step 1: Run the additive live migration and morphology build**

Run: `node scripts/lexical-graph.mjs build-lemma-forms --db scholomance_dict.sqlite --timestamp 2026-07-18T00:00:00.000Z`

Expected: exit 0, indexed count printed, no legacy table mutation.

- [ ] **Step 2: Verify live manifest and ambiguity rows read-only**

Run:

```bash
sqlite3 -readonly scholomance_dict.sqlite "select key,value from meta where key like 'lemma_form_%' order by key; select surface_lower,lemma_lower,pos,transform_id from lemma_form where surface_lower in ('axes','leaves','saw','better') order by surface_lower,lemma_lower,pos,transform_id;"
```

Expected: status `complete`; multiple lawful rows for each ambiguity fixture.

- [ ] **Step 3: Run focused and full verification**

```bash
npx vitest run tests/core/candidate-lattice tests/core/lexical-analysis tests/semantic-calculus/margin.law.test.js tests/server/lemma.sqlite.adapter.test.js tests/server/lexicalAnalyze.service.test.js tests/server/lexicalAnalyze.routes.test.js tests/pages/Read/analysisContext.test.js tests/pages/Read/useLexicalAnalyze.test.jsx tests/pages/Read/AnalyzePanel.test.jsx --reporter=verbose
npm run typecheck
npm run lint
npm run test:qa
npm run security:qa
npm run build
```

Expected: focused tests PASS; all mandatory gates PASS. If the documented pre-existing `ToolsSidebar.jsx applyFormat` typecheck failure still exists unchanged, record its exact output and prove no new type errors were introduced rather than claiming a clean typecheck.

- [ ] **Step 4: Run law/schema and visual checks**

Run the collab `law_audit` for the schema, morphology DDL, Analyze route, and context UI. Run:

```bash
npx playwright test tests/visual/lexical-analyze.real.spec.js --project=chromium --workers=1 --reporter=line
```

Expected: no schema-sovereignty, privacy, deterministic-ranking, or submit-only violation; visual spec PASS.

- [ ] **Step 5: Write the PIR with measured results**

The PIR must list spec/plan links, commits by task, live manifest counts/digest, ambiguity fixture rankings, focused/full gate outputs, degradation behavior, sovereignty verification, and any unchanged pre-existing failure. Do not include raw user draft context.

- [ ] **Step 6: Commit the PIR**

```bash
git add docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260718-MULTI-CANDIDATE-LEMMATIZATION.md
git commit -m "docs(pir): record multi-candidate lemmatization"
```

---

## Plan Self-Review Checklist

- [x] Every approved spec section maps to a task.
- [x] Word scope contains no semantic/POS scoring path or missing-channel warning.
- [x] Lone-candidate certainty reads manifest health, never row count.
- [x] Candidate admission is morphology-only and semantic ballistics cannot widen it.
- [x] Surface, candidate, and context retrieval anchors remain separate.
- [x] Context fields are discriminated, visibly consented, server-hashed, and cache-versioned.
- [x] Every production-code task starts from a failing test and records the expected failure.
- [x] File ownership matches AGENTS.md handoffs.
- [x] No task stages unrelated dirty-worktree changes.
- [x] No placeholders, undefined functions, or inconsistent type/property names remain.
