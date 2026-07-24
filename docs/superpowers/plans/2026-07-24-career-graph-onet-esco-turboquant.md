# Sovereign Career Graph Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser-local O*NET + ESCO Career Graph that performs evidence-backed occupation inference and skill-gap analysis, with FTS5/graph retrieval as law and TurboQuant as an optional bounded reranker.

**Architecture:** A reproducible Node build imports pinned source releases into canonical SQLite, validates a frozen benchmark, and emits a core occupation database plus occupation-family shards. A browser Web Worker opens the read-only shards through SQLite WASM, performs deterministic graph retrieval, and optionally reranks a lawful frontier with a separately gated local embedding model and TurboQuant. The existing Career analysis reconciles graph results with résumé spans and exposes only reversible, evidence-supported suggestions.

**Tech Stack:** Node 20.20.2, TypeScript 5.9.3, React 18, Vite 7, Vitest 4, Playwright 1.58, Zod 4, `better-sqlite3` 12.6.2, `csv-parse` 7.0.1, `@sqlite.org/sqlite-wasm` 3.53.0-build1, optional `@huggingface/transformers` 4.2.0, existing Scholomance TurboQuant.

## Global Constraints

- The approved design is `docs/superpowers/specs/2026-07-24-career-graph-onet-esco-turboquant-design.md`.
- O*NET and ESCO identities remain namespaced and distinct; a crosswalk is `mapped_to`, never `same_as`.
- `career_relation` is the sole Career Graph edge store.
- Downloaded source releases are pinned, checksummed, attributed, and never fetched at runtime.
- Résumé text, job-description text, evidence spans, and query vectors remain browser-local and transient.
- FTS5 and source-authored graph relations generate candidates before vectors run.
- TurboQuant may reorder a lawful frontier; it may not create concepts, relations, classifications, or résumé claims.
- An occupation-only skill can never be classified `missing`; posting evidence is mandatory.
- No top-level ATS pass probability or `overallScore`.
- IDs, ordering, build outputs, and policy bundles are deterministic; no timestamps or `Math.random()` participate in runtime behavior.
- The first-release benchmark contains exactly 180 pairs, including 36 adversarial pairs, and is frozen before threshold tuning.
- No more than three family shards may be resident; core and universal bridge shards remain pinned.
- The existing 32 MB gate applies to TurboQuant's incremental working set, not the total model runtime.
- Each task ends with a focused test run and an isolated commit.

## Program Gates

| Gate | Required before proceeding |
|---|---|
| A — Benchmark law | Corpus validator passes; annotation agreement meets alpha/F1 gates |
| B — Canonical graph | Referential integrity, provenance, deterministic checksum, and source licenses pass |
| C — Graph-only product | Held-out retrieval, sharding recall, privacy, and browser worker tests pass |
| D — Semantic feasibility | Model license, assets, cold start, memory, browser parity, and recall gates pass |
| E — Career release | Unsupported-claim rate is zero; UI, accessibility, cancellation, and export tests pass |

Semantic failure stops at Gate D and ships the graph-only product. It does not
block Gate C.

## File Map

### Benchmark and source build

- `benchmarks/career/v1/README.md` — annotation law and corpus provenance rules.
- `benchmarks/career/v1/corpus.jsonl` — 180 de-identified or licensed résumé/JD pairs.
- `benchmarks/career/v1/annotations.jsonl` — adjudicated occupation, skill, and evidence labels.
- `benchmarks/career/v1/splits.json` — frozen calibration/evaluation IDs.
- `benchmarks/career/v1/manifest.json` — counts and SHA-256 checksums.
- `scripts/career-graph/validate-benchmark.mjs` — Gate A validator.
- `scripts/career-graph/fetch-sources.mjs` — pinned-source downloader and checksum verifier.
- `scripts/career-graph/ingest-sources.mjs` — O*NET/ESCO/crosswalk normalization.
- `scripts/career-graph/build-database.mjs` — canonical SQLite and FTS5 builder.
- `scripts/career-graph/build-shards.mjs` — core, bridge, and family artifact builder.
- `scripts/career-graph/evaluate-reference.mjs` — held-out reference evaluator.

### Shared Career Graph contracts

- `src/lib/career/graph/contracts.ts` — graph identities, results, policies, and diagnostics.
- `src/lib/career/graph/schemas.ts` — Zod boundary validation.
- `src/lib/career/graph/policies.ts` — versioned deterministic formulas and thresholds.
- `src/lib/career/graph/evidence.ts` — evidence reconciliation and missing-skill law.
- `src/lib/career/graph/reference-query.ts` — Node/reference graph retrieval logic.
- `src/lib/career/graph/worker-protocol.ts` — browser worker request/response contract.
- `src/lib/career/graph/client.ts` — cancellable UI-facing client and fallback.
- `tests/fixtures/career-graph/runtime-fixtures.ts` — shared typed graph, document, client, and shard fixtures.

### Browser runtime and semantic gate

- `src/workers/career-graph.worker.ts` — SQLite WASM, shard residency, FTS5, and graph traversal.
- `src/lib/career/graph/shard-cache.ts` — deterministic three-family LRU.
- `src/lib/career/graph/career-embedder.ts` — optional local model adapter.
- `src/lib/career/graph/turboquant-reranker.ts` — lawful frontier reranker.
- `scripts/career-graph/benchmark-models.mjs` — Gate D measurement harness.

### Career integration

- `src/lib/career/analysis/analyze-career-with-graph.ts` — asynchronous graph-aware orchestrator.
- `src/lib/career/analysis/scorecard-v2.ts` — versioned decomposed scorecard.
- `src/pages/Career/TargetRolePanel.tsx` — occupation confirmation.
- `src/pages/Career/SkillEvidencePanel.tsx` — classified skills and evidence trails.
- `src/pages/Career/CareerPage.tsx` — state orchestration only.
- `src/pages/Career/DataArchiveDrawer.tsx` — provenance, policy, and attribution.

---

## Phase A — Benchmark and Deterministic Substrate

### Task 1: Repair Existing Career Preconditions

**Files:**
- Modify: `src/lib/career/parser/adapters/pasted-text.ts`
- Modify: `src/lib/career/analysis/analyze-career.ts`
- Modify: `src/lib/career/analysis/scorecard.ts`
- Test: `tests/unit/careerAdapters.test.ts`
- Test: `tests/unit/careerAnalysisBoundary.test.ts`

**Interfaces:**
- Consumes: existing `ResumeDocument.confidence`
- Produces: browser-safe byte measurement and one canonical `toPercentConfidence(value)` helper

- [ ] **Step 1: Write failing regression tests**

```typescript
import { describe, expect, it } from 'vitest';
import { parseResumeSource } from '../../src/lib/career/parser/parse-resume';
import { toPercentConfidence } from '../../src/lib/career/analysis/analyze-career';

describe('Career graph prerequisites', () => {
  it('parses pasted text when Buffer is absent', async () => {
    const original = globalThis.Buffer;
    // @ts-expect-error browser simulation
    globalThis.Buffer = undefined;
    await expect(parseResumeSource({ type: 'paste', content: 'Jane Doe\nExperience' }))
      .resolves.toMatchObject({ source: { type: 'paste' } });
    globalThis.Buffer = original;
  });

  it.each([[0.91, 91], [91, 91], [null, null]])(
    'normalizes confidence %s to %s',
    (input, expected) => expect(toPercentConfidence(input)).toBe(expected)
  );
});
```

- [ ] **Step 2: Run the focused tests and verify failure**

Run: `npx vitest run tests/unit/careerAdapters.test.ts tests/unit/careerAnalysisBoundary.test.ts`

Expected: FAIL because pasted-text parsing references `Buffer` and
`toPercentConfidence` is not exported.

- [ ] **Step 3: Implement the minimal repairs**

```typescript
// pasted-text.ts
const byteLength = new TextEncoder().encode(text).byteLength;

// analyze-career.ts
export function toPercentConfidence(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  const scaled = value >= 0 && value <= 1 ? value * 100 : value;
  return Math.min(100, Math.max(0, Math.round(scaled)));
}
```

Use `toPercentConfidence` in `analyze-career.ts` and `scorecard.ts`; remove
duplicated confidence arithmetic.

- [ ] **Step 4: Verify focused and existing Career tests**

Run: `npx vitest run tests/unit/careerAdapters.test.ts tests/unit/careerAnalysisBoundary.test.ts tests/unit/careerKeywordMatcher.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/parser/adapters/pasted-text.ts src/lib/career/analysis/analyze-career.ts src/lib/career/analysis/scorecard.ts tests/unit/careerAdapters.test.ts tests/unit/careerAnalysisBoundary.test.ts
git commit -m "fix: normalize browser career prerequisites"
```

### Task 2: Promote Career Graph Contracts into Schema Law

**Files:**
- Create: `src/lib/career/graph/contracts.ts`
- Create: `src/lib/career/graph/schemas.ts`
- Create: `src/lib/career/graph/policies.ts`
- Create: `tests/fixtures/career-graph/runtime-fixtures.ts`
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`
- Test: `tests/unit/careerGraphContracts.test.ts`

**Interfaces:**
- Consumes: `TextSpan` from `src/lib/career/parser/types.ts`
- Produces: `CareerGraphManifest`, `OccupationCandidate`, `SkillClassification`, `CareerGraphAnalysis`, `CareerGraphDiagnostic`, `CAREER_POLICY_BUNDLE`, typed fixture factories used by later tasks

- [ ] **Step 1: Write the failing contract test**

```typescript
import { describe, expect, it } from 'vitest';
import { CareerGraphAnalysisSchema } from '../../src/lib/career/graph/schemas';
import { CAREER_POLICY_BUNDLE } from '../../src/lib/career/graph/policies';

describe('Career Graph contracts', () => {
  it('requires policy identity, provenance, and evidence', () => {
    const parsed = CareerGraphAnalysisSchema.parse({
      artifactId: 'career-graph:onet-30.3:esco-1.2.1',
      policy: CAREER_POLICY_BUNDLE,
      occupations: [],
      skills: [{
        conceptId: 'esco:https://example.test/skill/sql',
        label: 'SQL',
        classification: 'missing',
        requirement: 'required',
        relationPath: ['onet:15-1252.00', 'esco:https://example.test/skill/sql'],
        sources: ['onet-30.3', 'esco-1.2.1'],
        jobEvidence: [{ coordinateSpace: 'raw', start: 0, end: 3 }],
        resumeEvidence: [],
        scores: { job: 1, occupation: 0.8, resume: 0, semantic: null },
      }],
      diagnostics: [],
      mode: 'graph',
    });
    expect(parsed.policy.skillClassification).toBe('career-evidence-v1');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphContracts.test.ts`

Expected: FAIL because the graph contracts do not exist.

- [ ] **Step 3: Implement exact public contracts**

```typescript
// contracts.ts
import type { TextSpan } from '../parser/types';

export type SkillClass = 'demonstrated' | 'adjacent' | 'missing' | 'not_required' | 'ambiguous';
export type RequirementKind = 'required' | 'preferred' | 'optional' | 'none';

export interface CareerPolicyBundle {
  occupationInference: 'occupation-inference-v1';
  candidateFrontier: 'career-frontier-v1';
  relationTraversal: 'career-traversal-v1';
  shard: 'career-shard-v1';
  skillClassification: 'career-evidence-v1';
  scorecard: 'career-scorecard-v2';
  thresholdChecksum: string;
}

export interface SkillClassification {
  conceptId: string;
  label: string;
  classification: SkillClass;
  requirement: RequirementKind;
  relationPath: string[];
  sources: string[];
  jobEvidence: TextSpan[];
  resumeEvidence: TextSpan[];
  scores: { job: number; occupation: number; resume: number; semantic: number | null };
}

export interface CareerGraphAnalysis {
  artifactId: string;
  policy: CareerPolicyBundle;
  occupations: OccupationCandidate[];
  skills: SkillClassification[];
  diagnostics: CareerGraphDiagnostic[];
  mode: 'graph_semantic' | 'graph' | 'lexical';
}
```

Add corresponding frozen constants in `policies.ts`, Zod schemas in
`schemas.ts`, and the same field names and invariants to `SCHEMA_CONTRACT.md`.

Create shared test factories with typed overrides:

```typescript
// tests/fixtures/career-graph/runtime-fixtures.ts
export function makeResumeDocument(overrides: Partial<ResumeDocument> = {}): ResumeDocument {
  return {
    schemaVersion: 1,
    source: { type: 'paste' },
    rawText: 'Built SQL reporting systems.',
    normalizedText: 'built sql reporting systems',
    offsetMap: [],
    sections: [],
    contact: { links: [] },
    diagnostics: [],
    confidence: 90,
    ...overrides,
  };
}

export function makeCareerGraphAnalysis(
  overrides: Partial<CareerGraphAnalysis> = {}
): CareerGraphAnalysis {
  return {
    artifactId: 'fixture-graph',
    policy: CAREER_POLICY_BUNDLE,
    occupations: [],
    skills: [],
    diagnostics: [],
    mode: 'graph',
    ...overrides,
  };
}

export const missingSqlSkill: SkillClassification = {
  conceptId: 'esco:sql',
  label: 'SQL',
  classification: 'missing',
  requirement: 'required',
  relationPath: ['onet:15-1252.00', 'esco:sql'],
  sources: ['onet-30.3', 'esco-1.2.1'],
  jobEvidence: [{ coordinateSpace: 'raw', start: 0, end: 3 }],
  resumeEvidence: [],
  scores: { job: 1, occupation: 0.9, resume: 0, semantic: null },
};

export const missingAndAdjacentSkills = [
  missingSqlSkill,
  { ...missingSqlSkill, conceptId: 'esco:python', label: 'Python', classification: 'adjacent' as const },
];

export const duplicateSqlAliases = [
  missingSqlSkill,
  { ...missingSqlSkill, label: 'Structured Query Language' },
];

export function makeGraphClient(options: { analysis: CareerGraphAnalysis }) {
  return { analyze: async () => options.analysis };
}

export function makeAmbiguousOccupationAnalysis(): CareerGraphAnalysis {
  return makeCareerGraphAnalysis({
    diagnostics: [{ code: 'OCCUPATION_CONFIRMATION_REQUIRED', severity: 'warning', message: 'Four families remain ambiguous.' }],
  });
}
```

- [ ] **Step 4: Run contract and type checks**

Run: `npx vitest run tests/unit/careerGraphContracts.test.ts`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/graph/contracts.ts src/lib/career/graph/schemas.ts src/lib/career/graph/policies.ts tests/fixtures/career-graph/runtime-fixtures.ts tests/unit/careerGraphContracts.test.ts "docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md"
git commit -m "feat: establish career graph schema law"
```

### Task 3: Freeze and Validate the Benchmark Corpus

**Files:**
- Create: `benchmarks/career/v1/README.md`
- Create: `benchmarks/career/v1/corpus.jsonl`
- Create: `benchmarks/career/v1/annotations.jsonl`
- Create: `benchmarks/career/v1/splits.json`
- Create: `benchmarks/career/v1/manifest.json`
- Create: `scripts/career-graph/validate-benchmark.mjs`
- Test: `tests/unit/careerBenchmarkContract.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: approved benchmark law in the design
- Produces: `validateCareerBenchmark(root): BenchmarkValidation`, command `npm run career:benchmark:validate`

- [ ] **Step 1: Write a failing validator test with a deliberately invalid fixture**

```typescript
import { describe, expect, it } from 'vitest';
import { validateBenchmarkRecords } from '../../scripts/career-graph/validate-benchmark.mjs';

describe('Career benchmark law', () => {
  it('rejects corpus leakage and count drift', () => {
    const result = validateBenchmarkRecords({
      corpus: [{ id: 'pair-001', productionUserDocument: true }],
      annotations: [],
      splits: { calibration: [], evaluation: [] },
    });
    expect(result.ok).toBe(false);
    expect(result.errors).toContain('PRODUCTION_DOCUMENT_FORBIDDEN:pair-001');
    expect(result.errors).toContain('PAIR_COUNT:1:EXPECTED:180');
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerBenchmarkContract.test.ts`

Expected: FAIL because the validator does not exist.

- [ ] **Step 3: Implement the validator and corpus formats**

```javascript
// validate-benchmark.mjs
export function validateBenchmarkRecords({ corpus, annotations, splits }) {
  const errors = [];
  if (corpus.length !== 180) errors.push(`PAIR_COUNT:${corpus.length}:EXPECTED:180`);
  for (const row of corpus) {
    if (row.productionUserDocument === true) {
      errors.push(`PRODUCTION_DOCUMENT_FORBIDDEN:${row.id}`);
    }
  }
  if (new Set(corpus.map((row) => row.id)).size !== corpus.length) {
    errors.push('DUPLICATE_PAIR_ID');
  }
  if (splits.calibration.length !== 60) errors.push('CALIBRATION_COUNT');
  if (splits.evaluation.length !== 120) errors.push('EVALUATION_COUNT');
  return Object.freeze({ ok: errors.length === 0, errors: Object.freeze(errors) });
}
```

Extend the validator to enforce all approved counts, named industries,
seniority counts, 23 SOC groups, 72 occupations, 36 adversarial cases, source
and license fields, at most 45 synthetic pairs, alpha >= 0.80, span F1 >= 0.80,
disjoint splits, and SHA-256 manifest integrity.

Add:

```json
"career:benchmark:validate": "node scripts/career-graph/validate-benchmark.mjs benchmarks/career/v1"
```

to `package.json`.

- [ ] **Step 4: Curate, independently annotate, adjudicate, and freeze all 180 pairs**

For every JSONL row, require these keys:

```json
{"id":"pair-001","resumeText":"Built SQL reporting systems for product analytics teams.","jobDescriptionText":"Technical product manager; SQL reporting experience required.","industry":"software-internet","seniority":"mid","socMajorGroup":"15","sourceRef":"licensed-source-001","licenseBasis":"CC-BY-4.0","authorship":"human","productionUserDocument":false}
```

Run: `npm run career:benchmark:validate`

Expected: `CAREER_BENCHMARK_VALID pairs=180 calibration=60 evaluation=120 adversarial=36`.

- [ ] **Step 5: Commit Gate A**

```bash
git add benchmarks/career/v1 scripts/career-graph/validate-benchmark.mjs tests/unit/careerBenchmarkContract.test.ts package.json
git commit -m "test: freeze career retrieval benchmark"
```

### Task 4: Pin, Fetch, and Inventory O*NET and ESCO Sources

**Files:**
- Create: `config/career-graph-sources.json`
- Create: `scripts/career-graph/fetch-sources.mjs`
- Modify: `.gitignore`
- Modify: `package.json`
- Test: `tests/unit/careerSourceManifest.test.ts`

**Interfaces:**
- Consumes: exact URLs and SHA-256 digests in `config/career-graph-sources.json`
- Produces: verified files under `data/career-graph/raw/<source-version>/`

- [ ] **Step 1: Write the failing source-manifest test**

```typescript
import { describe, expect, it } from 'vitest';
import sources from '../../config/career-graph-sources.json';

describe('Career source manifest', () => {
  it('pins versions, checksums, licenses, and attribution', () => {
    expect(sources.onet.version).toBe('30.3');
    expect(sources.esco.version).toBe('1.2.1');
    for (const source of Object.values(sources)) {
      expect(source.url).toMatch(/^https:\/\//);
      expect(source.sha256).toMatch(/^[a-f0-9]{64}$/);
      expect(source.license).toBeTruthy();
      expect(source.attribution).toBeTruthy();
    }
  });
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerSourceManifest.test.ts`

Expected: FAIL because the source manifest does not exist.

- [ ] **Step 3: Add source configuration and checksum-enforcing fetch**

```javascript
const digest = createHash('sha256').update(bytes).digest('hex');
if (digest !== source.sha256) {
  throw new Error(`CAREER_SOURCE_CHECKSUM_MISMATCH:${source.id}:${digest}`);
}
await mkdir(targetDir, { recursive: true });
await writeFile(targetPath, bytes);
```

The config must include O*NET 30.3 database, ESCO 1.2.1 CSV, and the official
O*NET–ESCO crosswalk. Add raw/build directories to `.gitignore` and:

```json
"career:sources:fetch": "node scripts/career-graph/fetch-sources.mjs"
```

- [ ] **Step 4: Verify checksums and offline re-run**

Run: `npm run career:sources:fetch`

Expected: three `CAREER_SOURCE_VERIFIED` lines.

Disconnect network or set `CAREER_GRAPH_OFFLINE=1`, run the command again.

Expected: verified cached files are accepted; missing cached files fail with
`CAREER_SOURCE_OFFLINE_MISSING`.

- [ ] **Step 5: Commit**

```bash
git add config/career-graph-sources.json scripts/career-graph/fetch-sources.mjs .gitignore package.json tests/unit/careerSourceManifest.test.ts
git commit -m "build: pin career ontology sources"
```

### Task 5: Build the Canonical SQLite Graph

**Files:**
- Create: `scripts/career-graph/schema.sql.js`
- Create: `scripts/career-graph/ingest-sources.mjs`
- Create: `scripts/career-graph/build-database.mjs`
- Create: `tests/fixtures/career-graph/mini-onet.csv`
- Create: `tests/fixtures/career-graph/mini-esco.csv`
- Create: `tests/fixtures/career-graph/mini-crosswalk.csv`
- Test: `tests/unit/careerGraphBuild.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: verified raw source files
- Produces: `buildCareerGraph({ sources, outputPath, policy }): CareerGraphBuildReport`

- [ ] **Step 1: Install the pinned CSV parser and synchronize both lockfiles**

Run: `pnpm add --save-exact csv-parse@7.0.1`

Run: `npm install --package-lock-only --ignore-scripts`

Expected: dependency and both lockfiles updated without audit failure.

- [ ] **Step 2: Write the failing mini-graph test**

```typescript
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';
import { buildCareerGraph } from '../../scripts/career-graph/build-database.mjs';

it('preserves namespaces and uses one edge store', async () => {
  const report = await buildCareerGraph({
    sources: 'tests/fixtures/career-graph',
    outputPath: '/tmp/career-graph-test.sqlite',
    policy: 'career-graph-schema-v1',
  });
  const db = new Database(report.outputPath, { readonly: true });
  expect(db.prepare('select count(*) n from career_concept').get().n).toBeGreaterThan(1);
  expect(db.prepare("select count(*) n from career_relation where predicate='mapped_to'").get().n).toBe(1);
  expect(db.prepare("select count(*) n from sqlite_master where name='career_search_fts'").get().n).toBe(1);
  expect(report.orphanRelations).toBe(0);
});
```

- [ ] **Step 3: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphBuild.test.ts`

Expected: FAIL because the build modules do not exist.

- [ ] **Step 4: Implement schema, normalization, FTS5, and sealed manifest**

```sql
CREATE TABLE career_concept (
  id TEXT PRIMARY KEY,
  namespace TEXT NOT NULL,
  external_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  preferred_label TEXT NOT NULL,
  description TEXT,
  source_release TEXT NOT NULL
) STRICT;

CREATE TABLE career_relation (
  id TEXT PRIMARY KEY,
  from_concept_id TEXT NOT NULL REFERENCES career_concept(id),
  predicate TEXT NOT NULL,
  to_concept_id TEXT NOT NULL REFERENCES career_concept(id),
  requirement_kind TEXT,
  importance REAL,
  level REAL,
  source_release TEXT NOT NULL,
  source_record_id TEXT NOT NULL
) STRICT;

CREATE VIRTUAL TABLE career_search_fts USING fts5(
  concept_id UNINDEXED,
  kind UNINDEXED,
  search_text,
  tokenize='unicode61 remove_diacritics 2'
);
```

Insert rows in canonical ID order, reject orphan relations, run
`PRAGMA integrity_check`, and compute the build checksum from sorted source,
schema, policy, and row-content digests.

Add:

```json
"career:graph:build": "node scripts/career-graph/build-database.mjs"
```

- [ ] **Step 5: Verify deterministic rebuild**

Run: `npx vitest run tests/unit/careerGraphBuild.test.ts`

Expected: PASS.

Run the fixture build twice and compare SHA-256.

Expected: identical digests.

- [ ] **Step 6: Commit**

```bash
git add scripts/career-graph tests/fixtures/career-graph tests/unit/careerGraphBuild.test.ts package.json package-lock.json pnpm-lock.yaml
git commit -m "feat: build canonical career graph"
```

### Task 6: Emit Core, Universal, and Family Shards

**Files:**
- Create: `scripts/career-graph/build-shards.mjs`
- Create: `scripts/career-graph/verify-shards.mjs`
- Test: `tests/unit/careerGraphShards.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: canonical `career_graph.sqlite`
- Produces: `career-core.sqlite`, `career-universal.sqlite`, `career-family-<SOC>.sqlite`, `manifest.json`

- [ ] **Step 1: Write the failing shard-law test**

```typescript
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import Database from 'better-sqlite3';

it('limits residency inputs and duplicates shared concepts without changing identity', async () => {
  const outputDir = await mkdtemp(join(tmpdir(), 'career-shards-'));
  const fixtureDb = join(outputDir, 'canonical.sqlite');
  await buildCareerGraph({
    sources: 'tests/fixtures/career-graph',
    outputPath: fixtureDb,
    policy: 'career-graph-schema-v1',
  });
  const manifest = await buildCareerShards({
    databasePath: fixtureDb,
    outputDir,
    policy: { maxFamilyShards: 3, universalMajorGroupMinimum: 2 },
  });
  expect(manifest.core).toBe('career-core.sqlite');
  expect(manifest.families).toContain('15');
  expect(manifest.policy.maxFamilyShards).toBe(3);
  expect(await conceptExists(outputDir, '15', 'esco:shared-skill')).toBe(true);
  expect(await conceptExists(outputDir, '27', 'esco:shared-skill')).toBe(true);
});

async function conceptExists(root: string, family: string, conceptId: string) {
  const db = new Database(join(root, `career-family-${family}.sqlite`), { readonly: true });
  return Boolean(db.prepare('select 1 from career_concept where id = ?').get(conceptId));
}
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphShards.test.ts`

Expected: FAIL because shard builders do not exist.

- [ ] **Step 3: Implement deterministic shard projection**

```javascript
export function familiesToLoad(candidates, ambiguityBand, max = 3) {
  if (candidates.length === 0) return [];
  const leader = candidates[0].score;
  return [...new Set(candidates
    .filter((row) => leader - row.score <= ambiguityBand)
    .map((row) => row.socMajorGroup))]
    .sort()
    .slice(0, max);
}
```

Build the universal shard from connectors and skills linked to at least two
major groups. Copy minimal shared concept/label/vector rows into each relevant
family shard. Store size, SHA-256, row counts, and policy identity per shard.

- [ ] **Step 4: Verify the full shard inventory**

Run: `node scripts/career-graph/verify-shards.mjs data/career-graph/build/manifest.json`

Expected: `CAREER_SHARDS_VALID core=1 universal=1 families=23 orphans=0`.

Run: `npx vitest run tests/unit/careerGraphShards.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Gate B**

```bash
git add scripts/career-graph/build-shards.mjs scripts/career-graph/verify-shards.mjs tests/unit/careerGraphShards.test.ts package.json
git commit -m "feat: emit deterministic career graph shards"
```

### Task 7: Implement Reference Retrieval and Classification Law

**Files:**
- Create: `src/lib/career/graph/reference-query.ts`
- Create: `src/lib/career/graph/evidence.ts`
- Test: `tests/unit/careerGraphReferenceQuery.test.ts`
- Test: `tests/unit/careerEvidenceLaw.test.ts`

**Interfaces:**
- Consumes: `CareerPolicyBundle`, SQLite query port, résumé/JD text
- Produces: `inferOccupations(...)`, `buildSkillFrontier(...)`, `classifySkill(...)`

- [ ] **Step 1: Write failing evidence-law tests**

```typescript
it('never marks occupation-only context missing', () => {
  expect(classifySkill({
    required: false, preferred: false,
    jobScore: 0, occupationScore: 0.99, resumeScore: 0,
    negated: false, outOfScope: false,
  }, thresholds)).toBe('not_required');
});

it('preserves an explicit posting requirement when ontology relevance is low', () => {
  expect(classifySkill({
    required: true, preferred: false,
    jobScore: 1, occupationScore: 0.1, resumeScore: 0,
    negated: false, outOfScope: false,
  }, thresholds)).toBe('missing');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphReferenceQuery.test.ts tests/unit/careerEvidenceLaw.test.ts`

Expected: FAIL because the query and evidence modules do not exist.

- [ ] **Step 3: Implement the approved algebra**

```typescript
export function classifySkill(input: EvidenceInput, t: EvidenceThresholds): SkillClass {
  if (input.negated || input.outOfScope) return 'not_required';
  const postingGate =
    input.required ||
    input.preferred ||
    (input.jobScore >= t.job && input.occupationScore >= t.occupation);
  if (!postingGate) return input.occupationScore >= t.occupation ? 'not_required' : 'ambiguous';
  if (input.resumeScore >= t.resume) return 'demonstrated';
  return 'missing';
}
```

Implement exact/alias/FTS5 occupation retrieval, stable score buckets, concept
ID tie-breaks, bounded graph traversal, and deterministic relation-path output.

- [ ] **Step 4: Run reference tests**

Run: `npx vitest run tests/unit/careerGraphReferenceQuery.test.ts tests/unit/careerEvidenceLaw.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/graph/reference-query.ts src/lib/career/graph/evidence.ts tests/unit/careerGraphReferenceQuery.test.ts tests/unit/careerEvidenceLaw.test.ts
git commit -m "feat: enforce career graph evidence law"
```

### Task 8: Evaluate the Graph-Only Reference Product

**Files:**
- Create: `scripts/career-graph/evaluate-reference.mjs`
- Create: `tests/fixtures/career-graph/expected-metrics.json`
- Create: `tests/fixtures/career-graph/evaluation-fixtures.ts`
- Test: `tests/unit/careerGraphEvaluation.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: frozen benchmark and canonical/sharded graph
- Produces: exact-ID Recall@K, crosswalk-aware Recall@K, bounded/unbounded recall, disagreement subset, unsupported-claim count

- [ ] **Step 1: Write the failing evaluator test**

```typescript
async function submitResumeAndJob() {
  fireEvent.change(screen.getByLabelText(/Your Experience/i), {
    target: { value: 'Built SQL reporting systems.' },
  });
  fireEvent.change(screen.getByLabelText(/Target Job Description/i), {
    target: { value: 'Technical product manager; SQL required.' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Parse & Inspect/i }));
  fireEvent.click(await screen.findByRole('button', { name: /Confirm & Align JD/i }));
}

import {
  loadBenchmarkFixture,
  loadGraphFixture,
} from '../fixtures/career-graph/evaluation-fixtures';

it('reports exact and crosswalk-aware metrics separately', async () => {
  const fixtureBenchmark = loadBenchmarkFixture();
  const fixtureGraph = loadGraphFixture();
  const report = await evaluateCareerGraph(fixtureBenchmark, fixtureGraph);
  expect(report).toMatchObject({
    occupation: { recallAt5: expect.any(Number) },
    skills: {
      sourceExactRecallAt20: expect.any(Number),
      crosswalkAwareRecallAt20: expect.any(Number),
    },
    unsupportedClaims: 0,
  });
  expect(report.skills.crosswalkAwareRecallAt20)
    .toBeGreaterThanOrEqual(report.skills.sourceExactRecallAt20);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphEvaluation.test.ts`

Expected: FAIL because the evaluator does not exist.

- [ ] **Step 3: Implement immutable metric reporting**

```javascript
const report = Object.freeze({
  artifactId,
  policy,
  benchmarkChecksum,
  occupation: { recallAt1, recallAt5 },
  skills: { sourceExactRecallAt20, crosswalkAwareRecallAt20 },
  frontier: { boundedRecallAt20, unboundedRecallAt20 },
  multiFamily: { recallAt20 },
  disagreementSubset: { count, sourceExactRecallAt20, crosswalkAwareRecallAt20 },
  unsupportedClaims,
});
```

Add:

```json
"career:graph:evaluate": "node scripts/career-graph/evaluate-reference.mjs"
```

- [ ] **Step 4: Run Gate C reference metrics**

Run: `npm run career:benchmark:validate && npm run career:graph:evaluate`

Expected: benchmark valid, unsupported claims `0`, and all thresholds meet the
values frozen in `expected-metrics.json`. If they do not, stop and revise the
policy version; do not tune against the held-out labels.

- [ ] **Step 5: Commit**

```bash
git add scripts/career-graph/evaluate-reference.mjs tests/fixtures/career-graph/expected-metrics.json tests/fixtures/career-graph/evaluation-fixtures.ts tests/unit/careerGraphEvaluation.test.ts package.json
git commit -m "test: gate graph-only career retrieval"
```

---

## Phase B — Sovereign Browser Runtime

### Task 9: Add SQLite WASM Worker and Protocol

**Files:**
- Create: `src/lib/career/graph/worker-protocol.ts`
- Create: `src/workers/career-graph.worker.ts`
- Test: `tests/unit/careerGraphWorkerProtocol.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`
- Modify: `vite.config.js`

**Interfaces:**
- Consumes: read-only shard URLs and `CareerGraphRequest`
- Produces: `CareerGraphWorkerRequest`, `CareerGraphWorkerResponse`

- [ ] **Step 1: Install official pinned SQLite WASM and synchronize both lockfiles**

Run: `pnpm add --save-exact @sqlite.org/sqlite-wasm@3.53.0-build1`

Run: `npm install --package-lock-only --ignore-scripts`

Expected: dependency and lockfiles updated.

- [ ] **Step 2: Write failing protocol tests**

```typescript
it('rejects stale or malformed worker messages', () => {
  expect(parseWorkerResponse({
    requestId: 'r1',
    kind: 'analysis',
    artifactId: '',
    payload: {},
  }).success).toBe(false);
});
```

- [ ] **Step 3: Implement typed protocol and direct module worker**

```typescript
export type CareerGraphWorkerRequest =
  | { requestId: string; kind: 'initialize'; manifestUrl: string }
  | { requestId: string; kind: 'analyze'; resumeText: string; jobDescriptionText: string; confirmedOccupationId?: string }
  | { requestId: string; kind: 'cancel' };

const worker = new Worker(
  new URL('../../../workers/career-graph.worker.ts', import.meta.url),
  { type: 'module' }
);
```

In the worker, use `sqlite3InitModule` and the OO1 API directly. Do not use the
deprecated Worker1 or Promiser1 APIs. Open fetched database bytes read-only in
the worker. Use Cache Storage for V1; do not require OPFS or COOP/COEP headers.

Add `@sqlite.org/sqlite-wasm` to `optimizeDeps.exclude` in `vite.config.js`.

- [ ] **Step 4: Verify protocol and production bundle**

Run: `npx vitest run tests/unit/careerGraphWorkerProtocol.test.ts`

Expected: PASS.

Run: `npm run build:app`

Expected: PASS with a SQLite WASM asset in the build output.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/graph/worker-protocol.ts src/workers/career-graph.worker.ts tests/unit/careerGraphWorkerProtocol.test.ts package.json package-lock.json pnpm-lock.yaml vite.config.js
git commit -m "feat: add sovereign career graph worker"
```

### Task 10: Enforce Three-Family Residency and Cancellation

**Files:**
- Create: `src/lib/career/graph/shard-cache.ts`
- Modify: `src/workers/career-graph.worker.ts`
- Test: `tests/unit/careerShardCache.test.ts`
- Test: `tests/unit/careerGraphWorkerCancellation.test.ts`

**Interfaces:**
- Consumes: manifest, occupation candidates, `career-shard-v1`
- Produces: `CareerShardCache.ensureFamilies(ids, activeRequestId)`, deterministic eviction, stale-result rejection

- [ ] **Step 1: Write failing LRU and cancellation tests**

```typescript
function makeWorkerHarness() {
  const responses: CareerGraphWorkerResponse[] = [];
  const runtime = createCareerWorkerRuntime((message) => responses.push(message));
  return {
    responses,
    post: (message: CareerGraphWorkerRequest) => runtime.onMessage(message),
    flush: () => runtime.whenIdle(),
  };
}

it('pins core and universal while retaining at most three families', async () => {
  const cache = new CareerShardCache({ maxFamilies: 3 });
  await cache.ensureFamilies(['15', '27', '29'], 'r1');
  await cache.ensureFamilies(['11'], 'r2');
  expect(cache.residentFamilies()).toEqual(['11', '27', '29']);
  expect(cache.isPinned('core')).toBe(true);
  expect(cache.isPinned('universal')).toBe(true);
});

it('does not publish a canceled request', async () => {
  const runtime = makeWorkerHarness();
  runtime.post({ requestId: 'r1', kind: 'analyze', resumeText: 'SQL', jobDescriptionText: 'SQL' });
  runtime.post({ requestId: 'r1', kind: 'cancel' });
  await runtime.flush();
  expect(runtime.responses.some((row) => row.requestId === 'r1' && row.kind === 'analysis')).toBe(false);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerShardCache.test.ts tests/unit/careerGraphWorkerCancellation.test.ts`

Expected: FAIL because cache and cancellation gates do not exist.

- [ ] **Step 3: Implement stable LRU**

```typescript
touch(id: string): void {
  this.clock += 1;
  this.entries.get(id)!.lastUsed = this.clock;
}

evictableFamilies(): Entry[] {
  return [...this.entries.values()]
    .filter((entry) => entry.kind === 'family' && !entry.active)
    .sort((a, b) => a.lastUsed - b.lastUsed || a.id.localeCompare(b.id));
}
```

Mark active-analysis shards non-evictable. On quota failure, use session memory.
On memory pressure, cancel semantic work before graph data. Check
`canceledRequestIds` before every response post.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/careerShardCache.test.ts tests/unit/careerGraphWorkerCancellation.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/graph/shard-cache.ts src/workers/career-graph.worker.ts tests/unit/careerShardCache.test.ts tests/unit/careerGraphWorkerCancellation.test.ts
git commit -m "feat: enforce career shard residency law"
```

### Task 11: Add Cancellable Client and Graph-Only Fallback

**Files:**
- Create: `src/lib/career/graph/client.ts`
- Test: `tests/unit/careerGraphClient.test.ts`

**Interfaces:**
- Consumes: `CareerGraphWorkerRequest/Response`
- Produces: `CareerGraphClient.initialize()`, `analyze()`, `cancel()`, `dispose()`

- [ ] **Step 1: Write failing client tests**

```typescript
it('rejects stale responses and falls back without losing lexical analysis', async () => {
  const worker = new FakeWorker();
  const client = new CareerGraphClient(() => worker);
  const input = {
    resumeText: 'Built SQL reporting systems.',
    jobDescriptionText: 'SQL required.',
  };
  const lexicalFallback = (diagnostic: CareerGraphDiagnostic) =>
    makeCareerGraphAnalysis({ mode: 'lexical', diagnostics: [diagnostic] });
  const stale = makeCareerGraphAnalysis({ artifactId: 'stale-artifact' });
  const pending = client.analyze(input, { fallback: lexicalFallback });
  worker.emit({ requestId: 'old', kind: 'analysis', payload: stale });
  worker.emit({ requestId: worker.latestRequestId, kind: 'degraded', code: 'SHARD_MISSING' });
  await expect(pending).resolves.toMatchObject({ mode: 'lexical', diagnostics: [{ code: 'SHARD_MISSING' }] });
});
```

The test file uses this synchronous worker stub:

```typescript
class FakeWorker {
  latestRequestId = '';
  listeners = new Set<(event: MessageEvent) => void>();
  postMessage(message: CareerGraphWorkerRequest) {
    this.latestRequestId = message.requestId;
  }
  terminate() {
    this.listeners.clear();
  }
  addEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.add(listener);
  }
  removeEventListener(_type: 'message', listener: (event: MessageEvent) => void) {
    this.listeners.delete(listener);
  }
  emit(data: CareerGraphWorkerResponse) {
    const event = new MessageEvent('message', { data });
    for (const listener of this.listeners) listener(event);
  }
}
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphClient.test.ts`

Expected: FAIL because the client does not exist.

- [ ] **Step 3: Implement request identity and fallback**

```typescript
async analyze(
  input: CareerGraphInput,
  options: AnalyzeOptions = {}
): Promise<CareerGraphAnalysis> {
  const requestId = stableRequestId(input, ++this.sequence);
  this.activeRequestId = requestId;
  const fallback = options.fallback ?? buildLexicalFallback;
  try {
    return await this.send({ requestId, kind: 'analyze', ...input });
  } catch (error) {
    return fallback(toDiagnostic(error));
  }
}
```

`dispose()` terminates the worker and rejects pending requests. `cancel()`
posts an explicit cancel message. A stale response never resolves the current
promise.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/careerGraphClient.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit Gate C browser runtime**

```bash
git add src/lib/career/graph/client.ts tests/unit/careerGraphClient.test.ts
git commit -m "feat: add resilient career graph client"
```

---

## Phase C — Semantic Ascension

### Task 12: Build the Browser Model Feasibility Harness

**Files:**
- Create: `src/lib/career/graph/career-embedder.ts`
- Create: `scripts/career-graph/benchmark-models.mjs`
- Create: `config/career-embedding-candidates.json`
- Create: `tests/fixtures/career-graph/model-license-inventory.json`
- Test: `tests/unit/careerEmbeddingGate.test.ts`
- Test: `tests/visual/career-embedding-benchmark.spec.ts`
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: frozen calibration split only
- Produces: `EmbeddingFeasibilityReport` and a go/no-go artifact

- [ ] **Step 1: Install pinned Transformers.js and synchronize both lockfiles**

Run: `pnpm add --save-exact @huggingface/transformers@4.2.0`

Run: `npm install --package-lock-only --ignore-scripts`

Expected: dependency and lockfiles updated.

- [ ] **Step 2: Write failing feasibility-schema tests**

```typescript
it('cannot ascend a model without license and device measurements', () => {
  const result = evaluateEmbeddingCandidate({
    modelId: 'Supabase/gte-small',
    revision: '93b36ff09519291b77d6000d2e86bd8565378086',
    license: null,
    browserMeasurements: [],
  }, limits);
  expect(result.ascend).toBe(false);
  expect(result.failures).toContain('MODEL_LICENSE_MISSING');
  expect(result.failures).toContain('BROWSER_MATRIX_INCOMPLETE');
});
```

- [ ] **Step 3: Implement a local-only model adapter**

```typescript
env.allowRemoteModels = false;
env.localModelPath = '/career-models/';

const extractor = await pipeline('feature-extraction', modelId, {
  dtype: 'q8',
  device: 'wasm',
});

const output = await extractor(text, { pooling: 'mean', normalize: true });
return Float32Array.from(output.data);
```

The candidate file contains exactly two initial candidates:

- `Supabase/gte-small` at revision
  `93b36ff09519291b77d6000d2e86bd8565378086`, MIT.
- `Xenova/all-MiniLM-L6-v2` at revision
  `751bff37182d3f1213fa05d7196b954e230abad9`, Apache-2.0.

Record model-file and tokenizer SHA-256 checksums after downloading those exact
revisions. A changed Hub `HEAD` does not change the candidate set.

- [ ] **Step 4: Measure every required device/browser dimension**

Run: `npx playwright test tests/visual/career-embedding-benchmark.spec.ts --workers=1`

Expected: JSON measurements for Chromium, Firefox, WebKit, and configured
mobile emulation: transferred bytes, cold start, warm latency, peak worker
memory where exposed, cache behavior, SIMD fallback, and output checksum.

Run: `node scripts/career-graph/benchmark-models.mjs`

Expected: either `CAREER_EMBEDDING_ASCEND:<model-id>:<revision>` or
`CAREER_EMBEDDING_NO_GO:<failure-codes>`. A no-go result stops Tasks 13–14 and
retains graph-only mode.

- [ ] **Step 5: Commit the feasibility evidence**

```bash
git add src/lib/career/graph/career-embedder.ts scripts/career-graph/benchmark-models.mjs config/career-embedding-candidates.json tests/fixtures/career-graph/model-license-inventory.json tests/unit/careerEmbeddingGate.test.ts tests/visual/career-embedding-benchmark.spec.ts package.json package-lock.json pnpm-lock.yaml
git commit -m "test: gate browser career embeddings"
```

### Task 13: Add Career TurboQuant Reranking and Fidelity Gate

**Files:**
- Create: `src/lib/career/graph/turboquant-reranker.ts`
- Modify: `scripts/career-graph/build-database.mjs`
- Test: `tests/unit/careerTurboQuantReranker.test.ts`
- Test: `tests/unit/careerTurboQuantFidelity.test.ts`

**Interfaces:**
- Consumes: lawful frontier, matching career embedding contract, `src/lib/math/quantization/index.js`
- Produces: `rerankCareerFrontier(query, candidates, options)`

- [ ] **Step 1: Write failing legality and fidelity tests**

```typescript
it('cannot add a concept outside the lawful frontier', async () => {
  const baseline = [{ conceptId: 'esco:a', graphRank: 1 }];
  const result = await rerankCareerFrontier(query, baseline, corpus, policy);
  expect(result.map((row) => row.conceptId)).toEqual(['esco:a']);
});

it('falls back when top-k overlap drops below 0.85', async () => {
  const result = enforceCareerTurboQa(baseline, divergent, 20);
  expect(result.mode).toBe('graph');
  expect(result.diagnostics[0].code).toBe('QUANT_PRECISION_LOSS');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerTurboQuantReranker.test.ts tests/unit/careerTurboQuantFidelity.test.ts`

Expected: FAIL because the reranker does not exist.

- [ ] **Step 3: Implement bounded reranking**

```typescript
export async function rerankCareerFrontier(
  query: Float32Array,
  frontier: readonly FrontierCandidate[],
  corpus: ReadonlyMap<string, QuantizedCareerVector>,
  policy: RerankPolicy
): Promise<RerankResult> {
  const lawfulIds = new Set(frontier.map((row) => row.conceptId));
  const scored = frontier.map((row) => ({
    ...row,
    semanticScore: compareCareerVector(query, corpus.get(row.conceptId), policy),
  }));
  const ordered = stableScoreSort(scored, policy.scoreBucket);
  if (ordered.some((row) => !lawfulIds.has(row.conceptId))) throw new Error('ILLEGAL_CANDIDATE');
  return enforceCareerTurboQa(frontier, ordered, policy.topK);
}
```

Build concept embeddings with the exact ascended model/lens metadata. Reject
kind, model, revision, dimensions, seed, or quantization mismatches.

- [ ] **Step 4: Verify fidelity and 32 MB incremental working set**

Run: `npx vitest run tests/unit/careerTurboQuantReranker.test.ts tests/unit/careerTurboQuantFidelity.test.ts`

Expected: PASS.

Run: `node scripts/career-graph/benchmark-models.mjs --turboquant`

Expected: top-K overlap >= 0.85, rerank p95 < 12 ms for 200 candidates, and
incremental working-set delta < 32 MB.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/graph/turboquant-reranker.ts scripts/career-graph/build-database.mjs tests/unit/careerTurboQuantReranker.test.ts tests/unit/careerTurboQuantFidelity.test.ts
git commit -m "feat: add lawful career semantic reranking"
```

### Task 14: Integrate Optional Semantic Mode into the Worker

**Files:**
- Modify: `src/workers/career-graph.worker.ts`
- Modify: `src/lib/career/graph/worker-protocol.ts`
- Test: `tests/unit/careerGraphSemanticFallback.test.ts`

**Interfaces:**
- Consumes: ascended model report and TurboQuant corpus
- Produces: result modes `graph_semantic`, `graph`, or `lexical`

- [ ] **Step 1: Write the failing fallback matrix**

```typescript
async function runWorkerScenario(fracture: string) {
  const harness = createSemanticWorkerHarness({ fracture });
  return harness.analyze({
    resumeText: 'Built SQL reporting systems.',
    jobDescriptionText: 'SQL required.',
  });
}

it.each([
  ['model unavailable', 'graph'],
  ['vector mismatch', 'graph'],
  ['quant fidelity failure', 'graph'],
  ['graph shard unavailable', 'lexical'],
])('degrades %s to %s', async (fracture, expectedMode) => {
  const result = await runWorkerScenario(fracture);
  expect(result.mode).toBe(expectedMode);
  expect(result.diagnostics).not.toHaveLength(0);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphSemanticFallback.test.ts`

Expected: FAIL because semantic mode is not integrated.

- [ ] **Step 3: Implement semantic-after-graph ordering**

```typescript
const graphResult = await runGraphAnalysis(input);
if (!semanticRuntime.ready) return withDiagnostic(graphResult, 'SEMANTIC_UNAVAILABLE');
const semanticResult = await semanticRuntime.rerank(graphResult.frontier, input);
return semanticResult.ok
  ? { ...graphResult, mode: 'graph_semantic', frontier: semanticResult.frontier }
  : withDiagnostic(graphResult, semanticResult.code);
```

No semantic error may prevent graph output. Every response carries artifact,
policy, threshold, model, and quantization identities.

- [ ] **Step 4: Run Gate D**

Run: `npx vitest run tests/unit/careerGraphSemanticFallback.test.ts tests/unit/careerTurboQuantReranker.test.ts tests/unit/careerTurboQuantFidelity.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/workers/career-graph.worker.ts src/lib/career/graph/worker-protocol.ts tests/unit/careerGraphSemanticFallback.test.ts
git commit -m "feat: ascend optional career semantic mode"
```

---

## Phase D — Evidence-First Career Experience

### Task 15: Add Graph-Aware Analysis and Scorecard V2

**Files:**
- Create: `src/lib/career/analysis/analyze-career-with-graph.ts`
- Create: `src/lib/career/analysis/scorecard-v2.ts`
- Modify: `src/lib/career/analysis/types.ts`
- Modify: `src/lib/career/schemas.ts`
- Test: `tests/unit/careerGraphAnalysisBoundary.test.ts`
- Test: `tests/unit/careerScorecardV2.test.ts`

**Interfaces:**
- Consumes: `ResumeDocument`, JD text, `CareerGraphClient`
- Produces: `analyzeCareerFitWithGraph(...)`, `CareerScorecardV2`

- [ ] **Step 1: Write failing boundary tests**

```typescript
import {
  makeCareerGraphAnalysis,
  makeResumeDocument,
} from '../fixtures/career-graph/runtime-fixtures';

it('keeps the scorecard decomposed and carries graph provenance', async () => {
  const document = makeResumeDocument();
  const jd = 'SQL required.';
  const fakeGraphClient = { analyze: async () => makeCareerGraphAnalysis() };
  const result = await analyzeCareerFitWithGraph(document, jd, fakeGraphClient);
  expect(result.scorecard).toMatchObject({
    policy: 'career-scorecard-v2',
    essentialSkillCoverage: expect.any(Number),
    preferredSkillCoverage: expect.any(Number),
    occupationAlignment: expect.any(Number),
    evidenceStrength: expect.any(Number),
  });
  expect(result.scorecard).not.toHaveProperty('overallScore');
  expect(result.graph?.artifactId).toBe('fixture-graph');
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphAnalysisBoundary.test.ts tests/unit/careerScorecardV2.test.ts`

Expected: FAIL because graph-aware analysis and V2 scorecard do not exist.

- [ ] **Step 3: Implement asynchronous orchestration**

```typescript
export async function analyzeCareerFitWithGraph(
  document: ResumeDocument,
  jobDescriptionText: string,
  graphClient: CareerGraphPort,
  signal?: AbortSignal
): Promise<CareerAnalysisResult> {
  const lexical = analyzeCareerFit(document, jobDescriptionText);
  const graph = await graphClient.analyze({
    resumeText: document.rawText,
    jobDescriptionText,
  }, { signal });
  return reconcileCareerAnalysis(lexical, graph, document);
}
```

V2 computes parse, section, literal, essential, preferred, occupation,
evidence, quantification, and formatting dimensions. Preserve the V1 lexical
result when the graph returns `mode: 'lexical'`.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/careerGraphAnalysisBoundary.test.ts tests/unit/careerScorecardV2.test.ts tests/unit/careerAnalysisBoundary.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/analysis/analyze-career-with-graph.ts src/lib/career/analysis/scorecard-v2.ts src/lib/career/analysis/types.ts src/lib/career/schemas.ts tests/unit/careerGraphAnalysisBoundary.test.ts tests/unit/careerScorecardV2.test.ts
git commit -m "feat: add graph-aware career analysis"
```

### Task 16: Replace N-Gram Gap Suggestions with Canonical Evidence

**Files:**
- Modify: `src/lib/career/suggestions/build-suggestions.ts`
- Modify: `src/lib/career/analysis/types.ts`
- Modify: `src/lib/career/schemas.ts`
- Modify: `src/pages/Career/SuggestionReviewPanel.tsx`
- Test: `tests/unit/careerSuggestions.test.ts`
- Test: `tests/unit/careerGraphSuggestionSafety.test.ts`

**Interfaces:**
- Consumes: `SkillClassification[]`
- Produces: canonical concept-deduplicated safe wording suggestions; non-editable learning/interview gaps

- [ ] **Step 1: Write failing safety tests**

```typescript
import {
  duplicateSqlAliases,
  makeCareerGraphAnalysis,
  makeResumeDocument,
  missingAndAdjacentSkills,
} from '../fixtures/career-graph/runtime-fixtures';

it('does not turn missing or adjacent skills into résumé edits', () => {
  const document = makeResumeDocument();
  const graphAnalysis = makeCareerGraphAnalysis({ skills: missingAndAdjacentSkills });
  const suggestions = buildGraphCareerSuggestions(graphAnalysis, document);
  expect(suggestions.filter((row) => row.skillClass === 'missing' && row.after)).toHaveLength(0);
  expect(suggestions.filter((row) => row.skillClass === 'adjacent' && row.after)).toHaveLength(0);
});

it('deduplicates aliases by canonical concept ID', () => {
  const document = makeResumeDocument();
  const sqlAliasFixture = makeCareerGraphAnalysis({ skills: duplicateSqlAliases });
  const suggestions = buildGraphCareerSuggestions(sqlAliasFixture, document);
  expect(suggestions.filter((row) => row.conceptId === 'esco:sql')).toHaveLength(1);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts tests/unit/careerGraphSuggestionSafety.test.ts`

Expected: FAIL because graph classifications are not enforced.

- [ ] **Step 3: Implement canonical suggestion gates**

```typescript
if (skill.classification !== 'demonstrated') {
  return {
    conceptId: skill.conceptId,
    type: 'learning_gap',
    reason: explainGap(skill),
    after: undefined,
    requiresUserApproval: true,
    status: 'pending',
    editable: false,
  };
}
```

Use `Map<conceptId, ResumeSuggestion>` for deduplication. Permit automatic
accept only when a demonstrated evidence span supports the proposed wording.
Keep missing and adjacent items outside “Accept all low-risk.”
Extend `ResumeSuggestion.type` with `learning_gap`, and add optional
`conceptId`, `skillClass`, and `editable` fields to both TypeScript and Zod
contracts.

- [ ] **Step 4: Verify**

Run: `npx vitest run tests/unit/careerSuggestions.test.ts tests/unit/careerGraphSuggestionSafety.test.ts tests/unit/careerPageWorkflow.test.tsx`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/career/suggestions/build-suggestions.ts src/lib/career/analysis/types.ts src/lib/career/schemas.ts src/pages/Career/SuggestionReviewPanel.tsx tests/unit/careerSuggestions.test.ts tests/unit/careerGraphSuggestionSafety.test.ts
git commit -m "fix: forbid unsupported career suggestions"
```

### Task 17: Add Occupation Review and Skill Evidence UI

**Files:**
- Create: `src/pages/Career/TargetRolePanel.tsx`
- Create: `src/pages/Career/SkillEvidencePanel.tsx`
- Modify: `src/pages/Career/CareerPage.tsx`
- Modify: `src/pages/Career/CareerPage.css`
- Create: `tests/fixtures/career-graph/ui-fixtures.tsx`
- Test: `tests/unit/careerGraphPageWorkflow.test.tsx`

**Interfaces:**
- Consumes: `CareerGraphAnalysis`, occupation confirmation callback
- Produces: visible states `GRAPH_LOADING`, `OCCUPATION_REVIEW`, `GRAPH_ANALYZING`, `COMPLETE`, `ERROR`

- [ ] **Step 1: Write failing interaction tests**

```typescript
import {
  makeAmbiguousOccupationAnalysis,
  makeCareerGraphAnalysis,
  makeGraphClient,
  missingSqlSkill,
} from '../fixtures/career-graph/runtime-fixtures';

const ambiguousGraphClient = makeGraphClient({
  analysis: makeAmbiguousOccupationAnalysis(),
});

it('requires confirmation when more than three families are ambiguous', async () => {
  render(<CareerPage graphClient={ambiguousGraphClient} />);
  await submitResumeAndJob();
  expect(await screen.findByRole('heading', { name: /Confirm target role/i })).toBeVisible();
  expect(screen.getByText(/missing skills are paused/i)).toBeVisible();
  fireEvent.click(screen.getByRole('button', { name: /Technical Product Manager/i }));
  expect(await screen.findByText(/Essential skill coverage/i)).toBeVisible();
});

it('explains not-found versus does-not-possess', async () => {
  const missingSkillFixture = makeCareerGraphAnalysis({ skills: [missingSqlSkill] });
  render(<SkillEvidencePanel analysis={missingSkillFixture} />);
  expect(screen.getByText(/not found in this résumé/i)).toBeVisible();
  expect(screen.queryByText(/you do not have this skill/i)).toBeNull();
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/unit/careerGraphPageWorkflow.test.tsx`

Expected: FAIL because the panels and graph workflow do not exist.

- [ ] **Step 3: Implement UI orchestration**

```typescript
export type CareerStatus =
  | 'IDLE'
  | 'EXTRACTING'
  | 'PARSING'
  | 'PARSE_REVIEW'
  | 'GRAPH_LOADING'
  | 'OCCUPATION_REVIEW'
  | 'GRAPH_ANALYZING'
  | 'COMPLETE'
  | 'ERROR';

interface CareerPageProps {
  graphClient?: CareerGraphPort;
}

export default function CareerPage({
  graphClient: providedGraphClient,
}: CareerPageProps = {}) {
  const graphClientRef = useRef<CareerGraphPort>(
    providedGraphClient ?? createCareerGraphClient()
  );
  const analysisAbortRef = useRef<AbortController | null>(null);

  const handleConfirmAndAlign = async () => {
    if (!parsedDocument) return;
    analysisAbortRef.current?.abort();
    const controller = new AbortController();
    analysisAbortRef.current = controller;
    setStatus('GRAPH_ANALYZING');
    const result = await analyzeCareerFitWithGraph(
      parsedDocument,
      jobDescription,
      graphClientRef.current,
      controller.signal
    );
    if (!controller.signal.aborted) setAnalysisResult(result);
  };
}
```

Create the shared UI fixtures:

```typescript
export function makePrivateCareerFixture() {
  return {
    resumeText: 'PRIVATE_RESUME_SENTINEL',
    jobDescriptionText: 'PRIVATE_JOB_SENTINEL',
  };
}

export function CareerGraphCompleteFixture() {
  return <SkillEvidencePanel analysis={makeCareerGraphAnalysis({
    skills: [missingSqlSkill],
  })} />;
}

export async function runCareerAnalysis(input: {
  resumeText: string;
  jobDescriptionText: string;
}) {
  const client = makeGraphClient({ analysis: makeCareerGraphAnalysis() });
  return client.analyze(input);
}
```

Render Target Role before the scorecard and group skills into demonstrated,
safe wording, adjacent, missing, and ignored sections. Evidence trails show
job span, occupation, relation, canonical skill, résumé span, and scoring
contributions. Respect reduced motion and use text plus icons, not color alone.

- [ ] **Step 4: Verify workflow**

Run: `npx vitest run tests/unit/careerGraphPageWorkflow.test.tsx tests/unit/careerPageWorkflow.test.tsx`

Expected: PASS.

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Career/TargetRolePanel.tsx src/pages/Career/SkillEvidencePanel.tsx src/pages/Career/CareerPage.tsx src/pages/Career/CareerPage.css tests/fixtures/career-graph/ui-fixtures.tsx tests/unit/careerGraphPageWorkflow.test.tsx
git commit -m "feat: add evidence-first career graph UI"
```

### Task 18: Provenance, Accessibility, Privacy, and Release Gate

**Files:**
- Modify: `src/pages/Career/DataArchiveDrawer.tsx`
- Modify: `src/pages/Career/CareerPage.tsx`
- Create: `tests/qa/features/careerGraphPrivacy.test.ts`
- Create: `tests/qa/features/careerGraphAccessibility.test.tsx`
- Create: `tests/visual/career-graph.spec.ts`
- Create: `scripts/career-graph/verify-release.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: complete graph-aware Career result
- Produces: attribution surface, release verifier, `npm run career:graph:verify`

- [ ] **Step 1: Write failing privacy and accessibility tests**

```typescript
import { axe } from 'jest-axe';
import {
  CareerGraphCompleteFixture,
  makePrivateCareerFixture,
  runCareerAnalysis,
} from '../../fixtures/career-graph/ui-fixtures';

it('never sends user text over fetch', async () => {
  const privateFixture = makePrivateCareerFixture();
  const fetchSpy = vi.spyOn(globalThis, 'fetch');
  await runCareerAnalysis(privateFixture);
  for (const call of fetchSpy.mock.calls) {
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain(privateFixture.resumeText);
    expect(serialized).not.toContain(privateFixture.jobDescriptionText);
  }
});

it('has no serious accessibility violations', async () => {
  const { container } = render(<CareerGraphCompleteFixture />);
  const results = await axe(container);
  expect(results.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([]);
});
```

- [ ] **Step 2: Run and verify failure**

Run: `npx vitest run tests/qa/features/careerGraphPrivacy.test.ts tests/qa/features/careerGraphAccessibility.test.tsx`

Expected: FAIL until provenance copy and accessible relationships are present.

- [ ] **Step 3: Implement archive and release verifier**

The archive displays:

```text
O*NET 30.3 Database — USDOL/ETA — CC BY 4.0 — modifications identified
This service uses the ESCO classification of the European Commission.
Artifact: <artifact-id> / <checksum>
Policies: occupation-inference-v1 / career-frontier-v1 /
career-traversal-v1 / career-shard-v1 / career-evidence-v1 /
career-scorecard-v2
Mode: graph_semantic | graph | lexical
```

`verify-release.mjs` runs benchmark validation, artifact/shard integrity,
reference metrics, semantic gates when enabled, privacy tests, focused Career
tests, typecheck, build, and Playwright.

Add:

```json
"career:graph:verify": "node scripts/career-graph/verify-release.mjs"
```

- [ ] **Step 4: Run the complete release gate**

Run: `npm run career:graph:verify`

Expected:

```text
GATE_A_BENCHMARK PASS
GATE_B_CANONICAL_GRAPH PASS
GATE_C_GRAPH_BROWSER PASS
GATE_D_SEMANTIC PASS|SKIPPED_GRAPH_ONLY
GATE_E_CAREER_RELEASE PASS
UNSUPPORTED_CLAIMS 0
```

- [ ] **Step 5: Commit Gate E**

```bash
git add src/pages/Career/DataArchiveDrawer.tsx src/pages/Career/CareerPage.tsx tests/qa/features/careerGraphPrivacy.test.ts tests/qa/features/careerGraphAccessibility.test.tsx tests/visual/career-graph.spec.ts scripts/career-graph/verify-release.mjs package.json
git commit -m "test: seal sovereign career graph release"
```

## Final Verification

Run:

```bash
npm run career:benchmark:validate
npm run career:graph:build
npm run career:graph:evaluate
npm run career:graph:verify
npm run lint
npm run typecheck
npm run build:app
```

Required outcome:

- All commands exit `0`.
- Benchmark checksum matches the frozen manifest.
- Canonical and shard integrity checks report zero orphans.
- Graph-only result remains available with semantic assets disabled.
- Unsupported-claim count is exactly zero.
- No user text appears in network requests.
- Only explicitly accepted résumé edits appear in clean export.
- `git status --short` contains no untracked generated databases, downloaded
  source archives, model artifacts, or benchmark measurements.

## Execution Sequence

1. Execute Tasks 1–3 and stop for Gate A review.
2. Execute Tasks 4–8 and stop for Gate B/C reference review.
3. Execute Tasks 9–11 and stop for graph-only browser product review.
4. Execute Task 12 and make the explicit Gate D go/no-go decision.
5. Execute Tasks 13–14 only after a Gate D pass.
6. Execute Tasks 15–18 and run the complete release gate.
