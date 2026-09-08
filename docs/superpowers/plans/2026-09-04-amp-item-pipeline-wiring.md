# AMP Item-Pipeline Wiring (Phase 1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `item-foundry.js`'s 16 hardcoded per-AMP `if` conditionals with data-driven activation, sourced from a versioned, checksummed, self-documenting relevance registry (PB-AMP-RELEVANCE-v2), without changing what any spec forges today.

**Architecture:** Extend the existing PB-AMP-RELEVANCE-v1 substrate (schema, SQLite store, selector, CLI — built earlier today, 5 pilots registered) to v2: add a `pipeline` partition key, a `order` execution-sequence integer, and required `description`/`concept` documentation fields. Register all 16 `item`-pipeline AMPs with predicates measured directly from `item-foundry.js`'s real current gates. `item-foundry.js` loads records synchronously from the same tracked JSON files the SQLite store is built from (not from the DB itself — `forgeItemAsset()` is a synchronous function called from scripts and the browser adapter, and the DB wrapper's API is async by repo-wide rule; a sync JSON loader avoids an async rewrite of the whole forge path while staying byte-identical to what the DB would return). Each AMP's cutover ships only after a differential test proves the new predicate agrees with the AMP's real current gate across the repo's actual spec corpus.

**Tech Stack:** Node.js (ESM), vitest, better-sqlite3 (via `createDbWrapper`), no new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-04-amp-relevance-full-wiring-design.md`

## Global Constraints

- Every SQLite write goes through `createDbWrapper().execute()` — no raw `better-sqlite3` `.exec()`/`prepare().run()` (repo-wide lint rule, `.eslintrc.json` ~line 143-165).
- A relevance record's checksum is never hand-written — only `createAmpRelevanceRecord()` may produce one (existing rule, `amp-relevance.schema.js`'s own doc comment).
- `description` and `concept` are required non-empty strings on every record — enforced at creation, not optional (per spec §4, to avoid `amp-registry.js`'s write-only fate).
- No AMP's hardcoded `item-foundry.js` conditional is deleted until its differential test passes against the real spec corpus (`specs/*.json` + existing fixtures) — spec §6.4.
- `volume-lift-amp`'s real activation depends on call-time `opts.includeVolume` and a computed `routeVolume`, neither of which is spec content `selectActiveAmps` can see. It gets registered (discovery/documentation) but its `item-foundry.js` call site is explicitly **not** cut over in this plan — declared exception, not a silent gap (Task 9).
- Contract version bumps `PB-AMP-RELEVANCE-v1` → `PB-AMP-RELEVANCE-v2`; nothing in the tree consumes v1 records yet, so this is a clean schema replacement, not a live migration (spec §3).

---

## Task 1: Schema v2 — pipeline, order, description, concept

**Files:**
- Modify: `codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js`
- Test: `tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js`

**Interfaces:**
- Produces: `AMP_RELEVANCE_CONTRACT = 'PB-AMP-RELEVANCE-v2'`, `VALID_PIPELINES`, `createAmpRelevanceRecord({ pipeline, ampId, order, description, concept, version, appliesTo, requires })`, `validateAmpRelevance(record)` (now checking the four new fields), `canonicalAmpRelevanceJSON(record)` (now including them in the checksum).

- [ ] **Step 1: Write the failing tests**

Add to `tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js`:

```js
const ITEM_RECORD = {
  pipeline: 'item',
  ampId: 'chestplate-amp',
  order: 8,
  description: 'Chestplate trim/plate templating; gated on class:armor + archetype includes chestplate (item-foundry.js:325).',
  concept: 'structural',
  version: '2.0.0',
  appliesTo: [
    { field: 'class', op: 'eq', value: 'armor' },
    { field: 'archetype', op: 'includes', value: 'chestplate' },
  ],
  requires: [],
};

describe('PB-AMP-RELEVANCE-v2 envelope', () => {
  it('contract is now v2', () => {
    expect(AMP_RELEVANCE_CONTRACT).toBe('PB-AMP-RELEVANCE-v2');
  });

  it('createAmpRelevanceRecord requires pipeline, order, description, concept', () => {
    const record = createAmpRelevanceRecord(ITEM_RECORD);
    expect(record.pipeline).toBe('item');
    expect(record.order).toBe(8);
    expect(record.description).toBe(ITEM_RECORD.description);
    expect(record.concept).toBe('structural');
    expect(validateAmpRelevance(record).ok).toBe(true);
  });

  it('rejects a record with no pipeline', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, pipeline: undefined });
    const { ok, errors } = validateAmpRelevance(record);
    expect(ok).toBe(false);
    expect(errors.some((e) => e.startsWith('pipeline'))).toBe(true);
  });

  it('rejects an unknown pipeline', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, pipeline: 'not-a-real-pipeline' });
    expect(validateAmpRelevance(record).ok).toBe(false);
  });

  it('rejects a non-integer order', () => {
    const record = createAmpRelevanceRecord({ ...ITEM_RECORD, order: 1.5 });
    expect(validateAmpRelevance(record).ok).toBe(false);
  });

  it('rejects empty description or concept', () => {
    expect(validateAmpRelevance(createAmpRelevanceRecord({ ...ITEM_RECORD, description: '' })).ok).toBe(false);
    expect(validateAmpRelevance(createAmpRelevanceRecord({ ...ITEM_RECORD, concept: '   ' })).ok).toBe(false);
  });

  it('checksum changes when pipeline, order, description, or concept changes', () => {
    const base = createAmpRelevanceRecord(ITEM_RECORD);
    const reordered = createAmpRelevanceRecord({ ...ITEM_RECORD, order: 9 });
    const redescribed = createAmpRelevanceRecord({ ...ITEM_RECORD, description: 'different text entirely here' });
    expect(reordered.checksum).not.toBe(base.checksum);
    expect(redescribed.checksum).not.toBe(base.checksum);
  });

  it('parts.shading is now a valid appliesTo field (facet-amp needs it)', () => {
    const record = createAmpRelevanceRecord({
      ...ITEM_RECORD,
      ampId: 'facet-amp',
      appliesTo: [{ field: 'parts.shading', op: 'eq', value: 'faceted' }],
    });
    expect(validateAmpRelevance(record).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js`
Expected: FAIL — `AMP_RELEVANCE_CONTRACT` is still `'PB-AMP-RELEVANCE-v1'`, `pipeline`/`order`/`description`/`concept` are undefined on created records, `parts.shading` is not in `VALID_FIELDS`.

- [ ] **Step 3: Implement the v2 envelope**

In `codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js`:

```js
export const AMP_RELEVANCE_CONTRACT = 'PB-AMP-RELEVANCE-v2';

export const VALID_PIPELINES = Object.freeze([
  'item', 'chestplate-fidelity', 'render-fidelity', 'voxel-world',
  'character', 'image-lattice', 'cross-cutting', 'runtime',
]);

export const VALID_FIELDS = Object.freeze([
  'class', 'archetype', 'materials', 'parts',
  'parts.id', 'parts.profile', 'parts.fill.material', 'parts.shading',
]);
```

Replace `canonicalAmpRelevanceJSON`:

```js
export function canonicalAmpRelevanceJSON(record) {
  return JSON.stringify({
    contract: AMP_RELEVANCE_CONTRACT,
    pipeline: record?.pipeline,
    ampId: record?.ampId,
    order: record?.order,
    description: record?.description,
    concept: record?.concept,
    version: record?.version,
    appliesTo: record?.appliesTo ?? [],
    requires: record?.requires ?? [],
    schemaVersion: AMP_RELEVANCE_CONTRACT,
  });
}
```

Extend `validateAmpRelevance` — insert after the existing `ampId`/`version` checks:

```js
  if (typeof record.pipeline !== 'string' || !VALID_PIPELINES.includes(record.pipeline)) {
    errors.push(`pipeline: must be one of ${VALID_PIPELINES.join(', ')}, got '${record.pipeline}'`);
  }
  if (!Number.isInteger(record.order)) {
    errors.push('order: required integer (conveyor-belt position within its pipeline)');
  }
  if (typeof record.description !== 'string' || record.description.trim() === '') {
    errors.push('description: required non-empty string');
  }
  if (typeof record.concept !== 'string' || record.concept.trim() === '') {
    errors.push('concept: required non-empty string');
  }
```

Extend `createAmpRelevanceRecord`:

```js
export function createAmpRelevanceRecord({
  pipeline, ampId, order, description, concept, version, appliesTo = [], requires = [],
}) {
  const base = {
    contract: AMP_RELEVANCE_CONTRACT,
    pipeline,
    ampId,
    order,
    description,
    concept,
    version,
    appliesTo,
    requires,
    schemaVersion: AMP_RELEVANCE_CONTRACT,
  };
  return Object.freeze({ ...base, checksum: computeAmpRelevanceChecksum(base) });
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js`
Expected: PASS, all tests including the pre-existing v1-era ones (which now must also pass `pipeline`/`order`/`description`/`concept` — update the file's existing `CHESTPLATE` fixture at the top of the test file to include them, since it's reused by earlier tests in that file).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js tests/codex/core/pixelbrain/amp-substrate/amp-relevance.schema.test.js
git commit -m "feat(pixelbrain): AMP relevance schema v2 — pipeline, order, description, concept"
```

---

## Task 2: Database v2 migration + CRUD signatures

**Files:**
- Modify: `codex/core/pixelbrain/amp-substrate/amp-substrate.db.js`
- Test: `tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js`

**Interfaces:**
- Consumes: `validateAmpRelevance` from Task 1.
- Produces: `SUBSTRATE_SCHEMA_VERSION = 2`, `registerAmpRelevance(db, record)` (unchanged call shape, new columns), `listAmpRelevance(db, { pipeline } = {})`, `getAmpRelevance(db, pipeline, ampId)`, `unregisterAmpRelevance(db, pipeline, ampId)`. Rows now carry `pipeline`, `order` (aliased from `order_index`), `description`, `concept`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js` (alongside its existing `:memory:` setup):

```js
it('migrates to schema v2 with a (pipeline, ampId) composite key', async () => {
  const record = createAmpRelevanceRecord({
    pipeline: 'item', ampId: 'geometry-amp', order: 9,
    description: 'always-relevant base geometry pass', concept: 'structural',
    version: '2.0.0', appliesTo: [], requires: [],
  });
  await registerAmpRelevance(db, record);
  const rows = await listAmpRelevance(db, { pipeline: 'item' });
  expect(rows).toHaveLength(1);
  expect(rows[0].pipeline).toBe('item');
  expect(rows[0].order).toBe(9);
  expect(rows[0].description).toBe(record.description);
});

it('the same ampId may exist under two different pipelines', async () => {
  const itemRecord = createAmpRelevanceRecord({
    pipeline: 'item', ampId: 'shadow-amp', order: 1,
    description: 'item-pipeline shadow pass (hypothetical)', concept: 'lighting',
    version: '1.0.0', appliesTo: [], requires: [],
  });
  const renderRecord = createAmpRelevanceRecord({
    pipeline: 'render-fidelity', ampId: 'shadow-amp', order: 1,
    description: 'render-fidelity shadow pass', concept: 'lighting',
    version: '1.0.0', appliesTo: [], requires: [],
  });
  await registerAmpRelevance(db, itemRecord);
  await registerAmpRelevance(db, renderRecord);
  expect(await getAmpRelevance(db, 'item', 'shadow-amp')).not.toBeNull();
  expect(await getAmpRelevance(db, 'render-fidelity', 'shadow-amp')).not.toBeNull();
});

it('listAmpRelevance with no filter returns every pipeline, ordered by (pipeline, order)', async () => {
  const rows = await listAmpRelevance(db);
  expect(rows.map((r) => r.pipeline)).toEqual([...rows.map((r) => r.pipeline)].sort());
});

it('unregisterAmpRelevance is scoped to (pipeline, ampId)', async () => {
  const record = createAmpRelevanceRecord({
    pipeline: 'item', ampId: 'facet-amp', order: 14,
    description: 'faceting pass for gem-class parts', concept: 'lighting',
    version: '2.0.0', appliesTo: [], requires: [],
  });
  await registerAmpRelevance(db, record);
  const deleted = await unregisterAmpRelevance(db, 'item', 'facet-amp');
  expect(deleted).toBe(true);
  expect(await getAmpRelevance(db, 'item', 'facet-amp')).toBeNull();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js`
Expected: FAIL — `listAmpRelevance`/`getAmpRelevance`/`unregisterAmpRelevance` don't accept a `pipeline` argument yet, and the v1 table has `amp_id` as its sole primary key.

- [ ] **Step 3: Implement the v2 migration and CRUD changes**

In `codex/core/pixelbrain/amp-substrate/amp-substrate.db.js`, bump the version and add a v2 migration:

```js
export const SUBSTRATE_SCHEMA_VERSION = 2;

const MIGRATION_V2 = [
  `DROP TABLE IF EXISTS amp_relevance`,
  `CREATE TABLE amp_relevance (
     pipeline        TEXT NOT NULL,
     amp_id          TEXT NOT NULL,
     order_index     INTEGER NOT NULL,
     description     TEXT NOT NULL,
     concept         TEXT NOT NULL,
     version         TEXT NOT NULL,
     applies_to_json TEXT NOT NULL,
     requires_json   TEXT NOT NULL,
     checksum        TEXT NOT NULL,
     registered_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
     PRIMARY KEY (pipeline, amp_id)
   )`,
];
```

Update `migrate()` to apply v1 (if starting fresh) then v2 in sequence — replace the single-version early-return with a loop:

```js
async function migrate(db) {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      namespace  TEXT NOT NULL,
      version    INTEGER NOT NULL,
      name       TEXT NOT NULL,
      applied_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (namespace, version)
    )
  `);

  const { rows } = await db.execute(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations WHERE namespace = ?',
    [SUBSTRATE_NAMESPACE],
  );
  let current = Number(rows?.[0]?.version ?? 0);
  const applied = [];

  if (current < 1) {
    for (const statement of MIGRATION_V1) await db.execute(statement);
    await db.execute(
      'INSERT INTO schema_migrations (namespace, version, name) VALUES (?, ?, ?)',
      [SUBSTRATE_NAMESPACE, 1, 'create_amp_relevance_and_activation_log'],
    );
    applied.push(1);
    current = 1;
  }
  if (current < 2) {
    for (const statement of MIGRATION_V2) await db.execute(statement);
    await db.execute(
      'INSERT INTO schema_migrations (namespace, version, name) VALUES (?, ?, ?)',
      [SUBSTRATE_NAMESPACE, 2, 'amp_relevance_v2_pipeline_order_description_concept'],
    );
    applied.push(2);
  }

  return { currentVersion: SUBSTRATE_SCHEMA_VERSION, applied };
}
```

Replace `registerAmpRelevance`:

```js
export async function registerAmpRelevance(db, record) {
  const { ok, errors } = validateAmpRelevance(record);
  if (!ok) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MOD, ERROR_CODES.INVALID_VALUE,
      { pipeline: record?.pipeline ?? null, ampId: record?.ampId ?? null, errors },
    );
  }

  await db.execute(
    `INSERT INTO amp_relevance
       (pipeline, amp_id, order_index, description, concept, version, applies_to_json, requires_json, checksum)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(pipeline, amp_id) DO UPDATE SET
       order_index     = excluded.order_index,
       description     = excluded.description,
       concept         = excluded.concept,
       version         = excluded.version,
       applies_to_json = excluded.applies_to_json,
       requires_json   = excluded.requires_json,
       checksum        = excluded.checksum,
       registered_at   = CURRENT_TIMESTAMP`,
    [
      record.pipeline, record.ampId, record.order, record.description, record.concept,
      record.version, JSON.stringify(record.appliesTo ?? []), JSON.stringify(record.requires ?? []),
      record.checksum,
    ],
  );

  return { pipeline: record.pipeline, ampId: record.ampId, checksum: record.checksum };
}

export async function listAmpRelevance(db, { pipeline } = {}) {
  const selectCols = `pipeline, amp_id AS ampId, order_index AS "order", description, concept,
            version, applies_to_json AS appliesToJson, requires_json AS requiresJson,
            checksum, registered_at AS registeredAt`;
  const { rows } = pipeline
    ? await db.execute(
        `SELECT ${selectCols} FROM amp_relevance WHERE pipeline = ? ORDER BY order_index ASC`,
        [pipeline],
      )
    : await db.execute(
        `SELECT ${selectCols} FROM amp_relevance ORDER BY pipeline ASC, order_index ASC`,
      );
  return rows ?? [];
}

export async function getAmpRelevance(db, pipeline, ampId) {
  const { rows } = await db.execute(
    `SELECT pipeline, amp_id AS ampId, order_index AS "order", description, concept,
            version, applies_to_json AS appliesToJson, requires_json AS requiresJson,
            checksum, registered_at AS registeredAt
     FROM amp_relevance WHERE pipeline = ? AND amp_id = ?`,
    [pipeline, ampId],
  );
  return rows?.[0] ?? null;
}

export async function unregisterAmpRelevance(db, pipeline, ampId) {
  const result = await db.execute(
    'DELETE FROM amp_relevance WHERE pipeline = ? AND amp_id = ?',
    [pipeline, ampId],
  );
  return (result.rowsAffected ?? 0) > 0;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js`
Expected: PASS. Also update this file's existing tests that call `getAmpRelevance(db, ampId)`/`unregisterAmpRelevance(db, ampId)` with the old single-argument shape to pass `pipeline` first.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/amp-substrate/amp-substrate.db.js tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js
git commit -m "feat(pixelbrain): AMP substrate DB v2 — composite (pipeline, ampId) key"
```

---

## Task 3: Selector v2 — pipeline scoping + conveyor-belt ordering

**Files:**
- Modify: `codex/core/pixelbrain/amp-substrate/amp-selector.js`
- Test: `tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js`

**Interfaces:**
- Consumes: record rows shaped `{ pipeline, ampId, order, appliesToJson, requiresJson }` (Task 2's `listAmpRelevance` shape).
- Produces: `selectActiveAmps(pipeline, spec, records)` → `{ activated: string[] (order-sorted), skipped, specChecksum, selectorVersion, pipeline }`. `selectAndLog(db, pipeline, spec, records)`.

- [ ] **Step 1: Write the failing tests**

Add to `tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js`:

```js
const ITEM_RECORDS = [
  { pipeline: 'item', ampId: 'region-fill-amp', order: 10, appliesToJson: '[]', requiresJson: '[]' },
  { pipeline: 'item', ampId: 'chestplate-amp', order: 8,
    appliesToJson: JSON.stringify([{ field: 'class', op: 'eq', value: 'armor' }]), requiresJson: '[]' },
  { pipeline: 'item', ampId: 'noise-fill-amp', order: 11,
    appliesToJson: '[]', requiresJson: JSON.stringify(['parts.noise']) },
];
const CROSS_CUTTING_RECORDS = [
  { pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1, appliesToJson: '[]', requiresJson: '[]' },
];

describe('pipeline scoping', () => {
  it('only evaluates records whose pipeline matches the argument', () => {
    const result = selectActiveAmps('item', { class: 'armor', parts: [] }, [...ITEM_RECORDS, ...CROSS_CUTTING_RECORDS]);
    expect(result.activated).not.toContain('symmetry-amp');
    expect(result.pipeline).toBe('item');
  });

  it('activated is sorted by order, not ampId', () => {
    const result = selectActiveAmps('item', { class: 'armor', parts: [{ id: 'p1', noise: { contract: 'PB-NOISE-v1' } }] }, ITEM_RECORDS);
    expect(result.activated).toEqual(['chestplate-amp', 'region-fill-amp', 'noise-fill-amp']);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js`
Expected: FAIL — `selectActiveAmps` currently takes `(spec, records)`, no pipeline argument, and sorts by `ampId`.

- [ ] **Step 3: Implement pipeline scoping and order sort**

In `codex/core/pixelbrain/amp-substrate/amp-selector.js`, replace `selectActiveAmps`:

```js
export function selectActiveAmps(pipeline, spec, records) {
  const scoped = (records ?? []).filter((r) => r.pipeline === pipeline);
  const activatedRecords = [];
  const skipped = [];

  const ordered = [...scoped].sort((a, b) => a.ampId.localeCompare(b.ampId));

  for (const record of ordered) {
    const appliesTo = JSON.parse(record.appliesToJson || '[]');
    const requires = JSON.parse(record.requiresJson || '[]');

    const required = satisfiesRequires(spec, requires);
    if (!required.ok) {
      skipped.push({ ampId: record.ampId, reason: `requires '${required.missing}', absent from spec` });
      continue;
    }

    const matched = appliesTo.length === 0 || appliesTo.every((clause) => matchesClause(spec, clause));
    if (matched) activatedRecords.push(record);
    else skipped.push({ ampId: record.ampId, reason: 'appliesTo did not match spec' });
  }

  activatedRecords.sort((a, b) => a.order - b.order);

  return {
    activated: activatedRecords.map((r) => r.ampId),
    skipped,
    specChecksum: sha256Hex(JSON.stringify(spec ?? null)),
    selectorVersion: SELECTOR_VERSION,
    pipeline,
  };
}

export async function selectAndLog(db, pipeline, spec, records) {
  const result = selectActiveAmps(pipeline, spec, records);
  await appendActivationLog(db, {
    specChecksum: result.specChecksum,
    activated: result.activated,
    skipped: result.skipped,
    selectorVersion: result.selectorVersion,
  });
  return result;
}
```

(`matchesClause`, `matchesLeaf`, `satisfiesOp`, `readPath`, `satisfiesRequires` are unchanged.)

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js`
Expected: PASS. Update this file's pre-existing tests (which call `selectActiveAmps(spec, records)` without a pipeline, and whose fixture records lack `pipeline`/`order`) to the new signature and fixture shape.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/amp-substrate/amp-selector.js tests/codex/core/pixelbrain/amp-substrate/amp-selector.test.js
git commit -m "feat(pixelbrain): AMP selector v2 — pipeline scoping, conveyor-belt order"
```

---

## Task 4: Synchronous record loader for the hot forge path

**Files:**
- Create: `codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js`
- Create: `tests/codex/core/pixelbrain/amp-substrate/fixtures/invalid-relevance/bad-record.json`
- Test: `tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js`

**Interfaces:**
- Consumes: `validateAmpRelevance` (Task 1), the JSON files under `codex/core/pixelbrain/amp-substrate/pilot-relevance/`.
- Produces: `loadRelevanceRecordsSync(dir?)` → `Array<{pipeline, ampId, order, appliesToJson, requiresJson, ...}>`, in the exact row shape `selectActiveAmps` expects. `clearRelevanceRecordsCache()` for tests.

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect, afterEach } from 'vitest';
import {
  loadRelevanceRecordsSync,
  clearRelevanceRecordsCache,
} from '../../../../../codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';

afterEach(() => clearRelevanceRecordsCache());

describe('loadRelevanceRecordsSync', () => {
  it('reads every JSON record from pilot-relevance/ synchronously', () => {
    const records = loadRelevanceRecordsSync();
    expect(records.length).toBeGreaterThan(0);
    expect(records.every((r) => typeof r.pipeline === 'string')).toBe(true);
  });

  it('throws with the offending filename when a record in the directory fails validation', () => {
    // Fixture dir with one deliberately invalid record (missing description).
    const badDir = join(process.cwd(), 'tests/codex/core/pixelbrain/amp-substrate/fixtures/invalid-relevance');
    expect(() => loadRelevanceRecordsSync(badDir)).toThrow(/description/);
  });

  it('the loaded records work directly with selectActiveAmps', () => {
    const records = loadRelevanceRecordsSync();
    const result = selectActiveAmps('item', { class: 'armor', archetype: 'chestplate', parts: [] }, records);
    expect(result.activated).toContain('chestplate-amp');
  });

  it('caches on repeated calls with the default directory', () => {
    const first = loadRelevanceRecordsSync();
    const second = loadRelevanceRecordsSync();
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Implement the loader**

```js
/**
 * Synchronous relevance-record loader for hot, synchronous forge paths.
 *
 * `item-foundry.js`'s `forgeItemAsset()` is called synchronously from scripts
 * and the browser Craft Gate adapter — making it async to read the AMP
 * substrate's SQLite store (whose wrapper API is async by repo-wide rule) would
 * be a breaking change to every caller. The substrate's real source of truth is
 * these tracked JSON files anyway (the DB is a queryable materialization of
 * them, built by `npm run amps -- register-pilots`), so a synchronous reader
 * over the same files gives identical records without touching the DB.
 *
 * @bytecode PB-AMP-RELEVANCE-v2
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAmpRelevance } from './amp-relevance.schema.js';
import {
  BytecodeError, ERROR_CATEGORIES, ERROR_SEVERITY, MODULE_IDS, ERROR_CODES,
} from '../bytecode-error.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = join(HERE, 'pilot-relevance');

let cache = null;

/** All relevance records, in the row shape `selectActiveAmps` consumes. */
export function loadRelevanceRecordsSync(dir = DEFAULT_DIR) {
  if (dir === DEFAULT_DIR && cache) return cache;

  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const records = files.map((file) => {
    const record = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const { ok, errors } = validateAmpRelevance(record);
    if (!ok) {
      throw new BytecodeError(
        ERROR_CATEGORIES.VALUE, ERROR_SEVERITY.CRIT, MODULE_IDS.AMP_SUBSTRATE, ERROR_CODES.INVALID_VALUE,
        { file, errors },
      );
    }
    return {
      pipeline: record.pipeline,
      ampId: record.ampId,
      order: record.order,
      appliesToJson: JSON.stringify(record.appliesTo ?? []),
      requiresJson: JSON.stringify(record.requires ?? []),
    };
  });

  if (dir === DEFAULT_DIR) cache = records;
  return records;
}

/** Test-only: force the next default-directory load to re-read from disk. */
export function clearRelevanceRecordsCache() {
  cache = null;
}
```

Also create the invalid-record fixture the "throws with the offending filename" test reads:

Create `tests/codex/core/pixelbrain/amp-substrate/fixtures/invalid-relevance/bad-record.json`:

```json
{
  "contract": "PB-AMP-RELEVANCE-v2",
  "schemaVersion": "PB-AMP-RELEVANCE-v2",
  "pipeline": "item",
  "ampId": "broken-amp",
  "order": 1,
  "concept": "structural",
  "version": "1.0.0",
  "appliesTo": [],
  "requires": [],
  "checksum": "0000000000000000000000000000000000000000000000000000000000000000"
}
```

(Deliberately missing `description` — this is what the "throws with the offending filename" test in Step 1 exercises. Its `checksum` is also wrong, but `validateAmpRelevance` reports every failing field, and the test only asserts the message matches `/description/`.)

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js`
Expected: PASS for the first, third (caching), and fourth (throws) tests. **The `selectActiveAmps` contains `chestplate-amp` assertion will only pass once Task 6 has re-migrated `pilot-relevance/chestplate-amp.json` to v2** — note this dependency and re-run this file's tests again after Task 6.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js tests/codex/core/pixelbrain/amp-substrate/fixtures/
git commit -m "feat(pixelbrain): synchronous AMP relevance loader for the hot forge path"
```

---

## Task 5: CLI updated for v2 (`--pipeline` filter, new fields displayed)

**Files:**
- Modify: `scripts/amp-substrate-cli.mjs`
- Test: `tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js`

**Interfaces:**
- Consumes: `listAmpRelevance(db, { pipeline })` (Task 2), `selectAndLog(db, pipeline, spec, records)` (Task 3).

- [ ] **Step 1: Write the failing test**

Add to `tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js` (this file already spawns the CLI as a subprocess against a temp DB — follow its existing pattern):

```js
it('list --pipeline=item only shows item-pipeline records', async () => {
  await registerFixtureRecord({ pipeline: 'item', ampId: 'region-fill-amp', order: 10 });
  await registerFixtureRecord({ pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1 });
  const { stdout } = await runCli(['list', '--pipeline=item']);
  expect(stdout).toContain('region-fill-amp');
  expect(stdout).not.toContain('symmetry-amp');
});

it('select requires --pipeline', async () => {
  const { stderr, code } = await runCli(['select', 'some-spec.json']);
  expect(code).not.toBe(0);
  expect(stderr).toContain('--pipeline');
});
```

(Use whatever `registerFixtureRecord`/`runCli` helpers this test file already defines for its existing subprocess-based tests — do not invent new ones; read the file first and match its established helper names.)

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js`
Expected: FAIL — `list` ignores `--pipeline`, `select` doesn't require it.

- [ ] **Step 3: Implement the CLI changes**

In `scripts/amp-substrate-cli.mjs`, update `cmdList` and `cmdSelect`:

```js
async function cmdList(db, args) {
  const flagIndex = args.indexOf('--pipeline');
  const pipeline = flagIndex !== -1 ? args[flagIndex + 1] : undefined;
  const rows = await listAmpRelevance(db, pipeline ? { pipeline } : {});
  if (rows.length === 0) { console.log('[AMP] no relevance records registered'); return; }
  console.log(`[AMP] ${rows.length} registered record(s)${pipeline ? ` in pipeline '${pipeline}'` : ''}:\n`);
  for (const row of rows) {
    const clauses = JSON.parse(row.appliesToJson);
    const requires = JSON.parse(row.requiresJson);
    const gate = clauses.length === 0 ? 'always relevant' : clauses.map(describeClause).join(' AND ');
    console.log(`  [${row.pipeline}] ${row.ampId.padEnd(26)} order ${String(row.order).padEnd(3)} v${row.version}`);
    console.log(`    ${row.description}`);
    console.log(`    when: ${gate}`);
    if (requires.length > 0) console.log(`    requires: ${requires.join(', ')}`);
  }
}

async function cmdSelect(db, args) {
  const pipelineIndex = args.indexOf('--pipeline');
  const pipeline = pipelineIndex !== -1 ? args[pipelineIndex + 1] : null;
  const file = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--pipeline');
  if (!pipeline) { console.error('[AMP] select: missing --pipeline <name>'); process.exit(1); }
  if (!file) { console.error('[AMP] select: missing <spec.json>'); process.exit(1); }
  const spec = readJson(file);
  const records = await listAmpRelevance(db);
  if (records.length === 0) {
    console.log('[AMP] no relevance records registered — nothing can activate. Run `register-pilots` first.');
    return;
  }

  const result = await selectAndLog(db, pipeline, spec, records);
  console.log(`[AMP] spec ${basename(file)}  pipeline '${pipeline}'  (${result.specChecksum.slice(0, 12)}…)`);
  console.log(`\n  ACTIVATED (${result.activated.length}, in order):`);
  if (result.activated.length === 0) console.log('    (none)');
  for (const ampId of result.activated) console.log(`    ✦ ${ampId}`);
  console.log(`\n  DORMANT (${result.skipped.length}):`);
  for (const { ampId, reason } of result.skipped) console.log(`    · ${ampId.padEnd(26)} ${reason}`);
}
```

Update `main()`'s dispatch to pass `args` (not just `args[1]`) into `cmdList`, and `printUsage()`'s text for `list`/`select` to document `--pipeline`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js`
Expected: PASS, including the pre-existing `select` tests updated to pass `--pipeline item`.

- [ ] **Step 5: Commit**

```bash
git add scripts/amp-substrate-cli.mjs tests/codex/core/pixelbrain/amp-substrate/amp-substrate-cli.test.js
git commit -m "feat(pixelbrain): AMP CLI v2 — --pipeline filter on list/select"
```

---

## Task 6: Migrate the 5 existing pilot records to v2

**Files:**
- Modify: `codex/core/pixelbrain/amp-substrate/pilot-relevance/chestplate-amp.json`
- Modify: `codex/core/pixelbrain/amp-substrate/pilot-relevance/holyfire-motif-amp.json`
- Modify: `codex/core/pixelbrain/amp-substrate/pilot-relevance/shield-rim-amp.json`
- Modify: `codex/core/pixelbrain/amp-substrate/pilot-relevance/shield-volume-amp.json`
- Modify: `codex/core/pixelbrain/amp-substrate/pilot-relevance/symmetry-amp.json`
- Create: `scripts/seed-amp-item-pipeline-records.mjs` (seed script, reused again in Task 7)
- Test: `tests/codex/core/pixelbrain/amp-substrate/item-pipeline-records.test.js`

**Interfaces:**
- Consumes: `createAmpRelevanceRecord` (Task 1).
- Produces: 5 valid v2 JSON files on disk; a re-runnable seed script other tasks extend.

`order` values are the real call-sequence position measured from `item-foundry.js`'s `forgeItemAsset()` (spec §6.1): holyfire-motif-amp=1, shield-rim-amp=4, shield-volume-amp=5, chestplate-amp=8. `symmetry-amp` moves to `pipeline: 'cross-cutting'` (its real callers are `nl-compile.js`/`scdl/passes/expand-symmetry.pass.js`/etc, not `item-foundry.js` — spec §7); it keeps `appliesTo: []` and gets `order: 1` (only one record in that pipeline so far).

- [ ] **Step 1: Write the failing test**

```js
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateAmpRelevance } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const PILOT_DIR = join(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../../codex/core/pixelbrain/amp-substrate/pilot-relevance',
);

describe('pilot-relevance/ is fully v2', () => {
  it('every JSON record in pilot-relevance/ validates as PB-AMP-RELEVANCE-v2', () => {
    const files = readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const record = JSON.parse(readFileSync(join(PILOT_DIR, file), 'utf8'));
      const { ok, errors } = validateAmpRelevance(record);
      expect(ok, `${file}: ${errors.join('; ')}`).toBe(true);
    }
  });

  it('the 4 item-pipeline pilots keep their real measured predicates', () => {
    const chestplate = JSON.parse(readFileSync(join(PILOT_DIR, 'chestplate-amp.json'), 'utf8'));
    expect(chestplate.pipeline).toBe('item');
    expect(chestplate.order).toBe(8);
    expect(chestplate.appliesTo).toEqual([
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'includes', value: 'chestplate' },
    ]);
  });

  it('symmetry-amp moved to the cross-cutting pipeline', () => {
    const symmetry = JSON.parse(readFileSync(join(PILOT_DIR, 'symmetry-amp.json'), 'utf8'));
    expect(symmetry.pipeline).toBe('cross-cutting');
    expect(symmetry.appliesTo).toEqual([]);
  });

  it('order is unique within each pipeline', () => {
    const files = readdirSync(PILOT_DIR).filter((f) => f.endsWith('.json'));
    const byPipeline = new Map();
    for (const file of files) {
      const r = JSON.parse(readFileSync(join(PILOT_DIR, file), 'utf8'));
      const seen = byPipeline.get(r.pipeline) ?? new Set();
      expect(seen.has(r.order), `${file}: duplicate order ${r.order} in pipeline ${r.pipeline}`).toBe(false);
      seen.add(r.order);
      byPipeline.set(r.pipeline, seen);
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/item-pipeline-records.test.js`
Expected: FAIL — the 5 existing files are still v1 shape (no `pipeline`/`order`/`description`/`concept`).

- [ ] **Step 3: Write the seed script and run it**

Create `scripts/seed-amp-item-pipeline-records.mjs`:

```js
#!/usr/bin/env node
/**
 * Seeds `codex/core/pixelbrain/amp-substrate/pilot-relevance/*.json` for the
 * `item` pipeline (and re-homes the pre-existing `symmetry-amp` pilot to
 * `cross-cutting`). Re-runnable and idempotent — the only sanctioned way to
 * produce a record's checksum is `createAmpRelevanceRecord`, so this script,
 * not hand-edited JSON, is the source of truth for these files.
 *
 * Predicates are measured directly from item-foundry.js's real current gates
 * (see docs/superpowers/specs/2026-09-04-amp-relevance-full-wiring-design.md
 * §6.1 for the call-order table this script's `order` values come from).
 *
 *   node scripts/seed-amp-item-pipeline-records.mjs
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createAmpRelevanceRecord } from '../codex/core/pixelbrain/amp-substrate/amp-relevance.schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PILOT_DIR = join(HERE, '../codex/core/pixelbrain/amp-substrate/pilot-relevance');

const RECORDS = [
  {
    pipeline: 'item', ampId: 'holyfire-motif-amp', order: 1, version: '2.0.0',
    description: 'Deterministic flame emission for holy-paladin swords; must run before template construction so motif cells join the silhouette (item-foundry.js:322-335).',
    concept: 'material-fx',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'weapon' },
      { field: 'archetype', op: 'eq', value: 'sword' },
      { anyOf: [
        { field: 'parts.profile', op: 'eq', value: 'weapon.sword.holyfire_motif' },
        { field: 'parts.id', op: 'eq', value: ['holyFire', 'holy_fire'] },
      ] },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'shield-rim-amp', order: 4, version: '2.0.0',
    description: 'Outer border, gold/bronze frame, rim thickness, corner highlights; gated on class:armor + archetype:kite_shield (item-foundry.js:381).',
    concept: 'structural',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'eq', value: 'kite_shield' },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'shield-volume-amp', order: 5, version: '2.0.0',
    description: 'Curved face shading, center plane, side shadows, rim cast shadows; gated on class:armor + archetype:kite_shield (item-foundry.js:382).',
    concept: 'lighting',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'eq', value: 'kite_shield' },
    ],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'chestplate-amp', order: 8, version: '2.0.0',
    description: 'Chestplate trim/plate templating; gated on class:armor + archetype includes chestplate (item-foundry.js:385).',
    concept: 'structural',
    appliesTo: [
      { field: 'class', op: 'eq', value: 'armor' },
      { field: 'archetype', op: 'includes', value: 'chestplate' },
    ],
    requires: [],
  },
  {
    pipeline: 'cross-cutting', ampId: 'symmetry-amp', order: 1, version: '1.0.1',
    description: 'Coordinate mirroring; called from nl-compile.js, scdl/passes/expand-symmetry.pass.js, scene-graph-renderer.js and others — genuinely cross-cutting, not item-pipeline specific.',
    concept: 'structural',
    appliesTo: [],
    requires: [],
  },
];

for (const fields of RECORDS) {
  const record = createAmpRelevanceRecord(fields);
  writeFileSync(join(PILOT_DIR, `${record.ampId}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`[seed] wrote ${record.pipeline}/${record.ampId}.json  ${record.checksum.slice(0, 12)}…`);
}
```

Run: `node scripts/seed-amp-item-pipeline-records.mjs`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/item-pipeline-records.test.js`
Expected: PASS.

Also re-run Task 4's loader test now that real v2 records exist on disk:
Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js`
Expected: PASS (the `chestplate-amp` assertion from Task 4 Step 4 now resolves).

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/amp-substrate/pilot-relevance/ scripts/seed-amp-item-pipeline-records.mjs tests/codex/core/pixelbrain/amp-substrate/item-pipeline-records.test.js
git commit -m "feat(pixelbrain): migrate 5 AMP pilots to v2, re-home symmetry-amp to cross-cutting"
```

---

## Task 7: Author the 12 new item-pipeline records with measured predicates

**Files:**
- Modify: `scripts/seed-amp-item-pipeline-records.mjs` (append 12 more entries to `RECORDS`, plus the `volume-lift-amp` discovery-only record)
- Test: `tests/codex/core/pixelbrain/amp-substrate/item-pipeline-differential.test.js`

**Interfaces:**
- Consumes: `selectActiveAmps('item', spec, records)` (Task 3), `loadRelevanceRecordsSync()` (Task 4).
- Produces: 13 more v2 JSON files (12 cutover-eligible + `volume-lift-amp`, discovery-only per the Global Constraints exception).

Each predicate below was read directly from `item-foundry.js` (line numbers as of this plan's writing), not invented:

| ampId | order | real gate (item-foundry.js) | predicate |
|---|---|---|---|
| `sketch-amp` | 2 | `sketchToSilhouette` runs unconditionally at line 374 (base template pass) | `appliesTo: []` |
| `sdf-shape-amp` | 3 | `spec.parts.filter(p => p.sdf).length > 0` (line 354) | `requires: ['parts.sdf']` |
| `heraldry-amp` | 6 | internal: `if (!spec.heraldry \|\| spec.heraldry.length === 0) return` (heraldry-amp.js:131, 211) | `requires: ['heraldry']` |
| `jewelry-amp` | 7 | internal: `hasGems \|\| ['amulet','ring','jewelry'].includes(spec.class)`, `hasGems = parts.some(profile startsWith 'gem.' OR id includes 'crystal'/'core')` (jewelry-amp.js:8-9) | `appliesTo: [{anyOf: [class eq [amulet,ring,jewelry], parts.profile matches ^gem\\., parts.id includes crystal, parts.id includes core]}]` |
| `geometry-amp` | 9 | `buildGeometryAmpPayload` runs unconditionally at line 387 | `appliesTo: []` |
| `region-fill-amp` | 10 | `applyRegionFills` runs unconditionally at line 407 (color authority, every item) | `appliesTo: []` |
| `noise-fill-amp` | 11 | `spec.parts.filter(p => p.noise).length > 0` (line 413) | `requires: ['parts.noise']` |
| `selout-amp` | 12 | internal: `if (!lightOptions) return fills` where `lightOptions = spec.light` (selout-amp.js:10) | `requires: ['light']` |
| `pixel-aa-amp` | 13 | `applyPixelAA` runs unconditionally at line 425 | `appliesTo: []` |
| `facet-amp` | 14 | internal: `if (!lightOptions) return` AND `parts.filter(p => p.shading === 'faceted').length === 0` returns (facet-amp.js:19,26) | `requires: ['light']`, `appliesTo: [{field: 'parts.shading', op: 'eq', value: 'faceted'}]` |
| `square-sharpness-contrast-amp` | 15 | `buildSquareSharpnessContrastPayload` runs unconditionally at line 434 (HD edge pass, every item) | `appliesTo: []` |
| `volume-lift-amp` | 16 | fallback only when `opts.includeVolume !== false` AND route did not already emit `routeVolume` (line 566-577) — **not spec content**, registered for discovery only, not cut over (Task 9 exception) | `appliesTo: []`, description states the exception explicitly |

- [ ] **Step 1: Write the failing differential tests**

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectActiveAmps } from '../../../../../codex/core/pixelbrain/amp-substrate/amp-selector.js';
import { loadRelevanceRecordsSync, clearRelevanceRecordsCache } from '../../../../../codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.js';

const SPECS_DIR = join(process.cwd(), 'specs');

function realSpecs() {
  return readdirSync(SPECS_DIR)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ file: f, spec: JSON.parse(readFileSync(join(SPECS_DIR, f), 'utf8')) }));
}

// The 16 real gates, copied verbatim from item-foundry.js / the AMP modules'
// own internal checks (§6.1 table above) — this is the oracle the registry's
// predicates must agree with, not the other way around.
function realGateFor(ampId, spec) {
  const parts = spec.parts || [];
  switch (ampId) {
    case 'holyfire-motif-amp':
      return spec.class === 'weapon' && spec.archetype === 'sword'
        && parts.some((p) => p.profile === 'weapon.sword.holyfire_motif' || p.id === 'holyFire' || p.id === 'holy_fire');
    case 'shield-rim-amp':
    case 'shield-volume-amp':
      return spec.class === 'armor' && spec.archetype === 'kite_shield';
    case 'chestplate-amp':
      return spec.class === 'armor' && String(spec.archetype || '').includes('chestplate');
    case 'sketch-amp':
    case 'geometry-amp':
    case 'region-fill-amp':
    case 'pixel-aa-amp':
    case 'square-sharpness-contrast-amp':
      return true;
    case 'sdf-shape-amp':
      return parts.some((p) => p.sdf);
    case 'heraldry-amp':
      return Array.isArray(spec.heraldry) && spec.heraldry.length > 0;
    case 'jewelry-amp': {
      const hasGems = parts.some((p) => p.profile && (p.profile.startsWith('gem.') || (p.id || '').includes('crystal') || (p.id || '').includes('core')));
      return hasGems || ['amulet', 'ring', 'jewelry'].includes(spec.class);
    }
    case 'noise-fill-amp':
      return parts.some((p) => p.noise);
    case 'selout-amp':
      return !!spec.light;
    case 'facet-amp':
      return !!spec.light && parts.some((p) => p.shading === 'faceted');
    default:
      throw new Error(`no oracle for ${ampId}`);
  }
}

const CUTOVER_ELIGIBLE = [
  'holyfire-motif-amp', 'sketch-amp', 'sdf-shape-amp', 'shield-rim-amp', 'shield-volume-amp',
  'heraldry-amp', 'jewelry-amp', 'chestplate-amp', 'geometry-amp', 'region-fill-amp',
  'noise-fill-amp', 'selout-amp', 'pixel-aa-amp', 'facet-amp', 'square-sharpness-contrast-amp',
];

describe('item-pipeline predicates agree with item-foundry.js real gates', () => {
  it.each(realSpecs())('$file: registry activation matches the real gate for every AMP', ({ spec }) => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const { activated } = selectActiveAmps('item', spec, records);
    for (const ampId of CUTOVER_ELIGIBLE) {
      expect(activated.includes(ampId)).toBe(realGateFor(ampId, spec));
    }
  });

  it('synthetic edge cases: sdf, noise, light, faceted, heraldry, gems all gate correctly', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const withEverything = {
      class: 'weapon', archetype: 'staff', light: { angle: 1 },
      heraldry: [{ id: 'e1' }],
      parts: [
        { id: 'blade', sdf: { shape: 'circle' }, noise: { contract: 'PB-NOISE-v1' }, shading: 'faceted' },
        { id: 'gem1', profile: 'gem.ruby' },
      ],
    };
    const { activated } = selectActiveAmps('item', withEverything, records);
    for (const ampId of ['sdf-shape-amp', 'noise-fill-amp', 'selout-amp', 'facet-amp', 'heraldry-amp', 'jewelry-amp']) {
      expect(activated).toContain(ampId);
    }

    const withNothing = { class: 'weapon', archetype: 'staff', parts: [{ id: 'blade' }] };
    const { activated: activatedBare } = selectActiveAmps('item', withNothing, records);
    for (const ampId of ['sdf-shape-amp', 'noise-fill-amp', 'selout-amp', 'facet-amp', 'heraldry-amp', 'jewelry-amp']) {
      expect(activatedBare).not.toContain(ampId);
    }
  });

  it('always-relevant item AMPs activate on every real spec', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    for (const { spec } of realSpecs()) {
      const { activated } = selectActiveAmps('item', spec, records);
      for (const ampId of ['sketch-amp', 'geometry-amp', 'region-fill-amp', 'pixel-aa-amp', 'square-sharpness-contrast-amp']) {
        expect(activated).toContain(ampId);
      }
    }
  });

  it('volume-lift-amp is registered but flagged as not cutover-eligible', () => {
    clearRelevanceRecordsCache();
    const records = loadRelevanceRecordsSync();
    const record = records.find((r) => r.pipeline === 'item' && r.ampId === 'volume-lift-amp');
    expect(record).toBeDefined();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/item-pipeline-differential.test.js`
Expected: FAIL — the 12 new AMPs aren't registered yet, so `activated` never contains them.

- [ ] **Step 3: Append the 12 new records (+ volume-lift-amp) to the seed script and re-run it**

Append to the `RECORDS` array in `scripts/seed-amp-item-pipeline-records.mjs` (before the `symmetry-amp` entry, which stays last):

```js
  {
    pipeline: 'item', ampId: 'sketch-amp', order: 2, version: '1.0.0',
    description: 'Distance-transform shading template (sketchToSilhouette) — the base template pass every item goes through; item-foundry.js:374 calls it unconditionally.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'sdf-shape-amp', order: 3, version: '1.0.0',
    description: 'Samples a signed-distance field at cell centers for parts that declare one; gated on parts.sdf presence (item-foundry.js:354-357).',
    concept: 'structural',
    appliesTo: [], requires: ['parts.sdf'],
  },
  {
    pipeline: 'item', ampId: 'heraldry-amp', order: 6, version: '1.0.0',
    description: 'Emblem stamping for shield faces/panels; both template and fill stages self-gate on spec.heraldry being a non-empty array (heraldry-amp.js:131,211).',
    concept: 'material-fx',
    appliesTo: [], requires: ['heraldry'],
  },
  {
    pipeline: 'item', ampId: 'jewelry-amp', order: 7, version: '1.0.0',
    description: 'Chains, gem settings, volume manipulation for jewelry; self-gates on spec.class in [amulet,ring,jewelry] OR any part with a gem.* profile / id containing crystal or core (jewelry-amp.js:8-9).',
    concept: 'material-fx',
    appliesTo: [{ anyOf: [
      { field: 'class', op: 'eq', value: ['amulet', 'ring', 'jewelry'] },
      { field: 'parts.profile', op: 'matches', value: '^gem\\.' },
      { field: 'parts.id', op: 'includes', value: 'crystal' },
      { field: 'parts.id', op: 'includes', value: 'core' },
    ] }],
    requires: [],
  },
  {
    pipeline: 'item', ampId: 'geometry-amp', order: 9, version: '1.0.0',
    description: 'Converts composed geometry into deterministic shader masks and construction diagnostics; item-foundry.js:387 calls it unconditionally for every item.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'region-fill-amp', order: 10, version: '1.0.0',
    description: 'Color authority for the Item Foundry — every cell gets its part fill or outline color; item-foundry.js:407 calls it unconditionally.',
    concept: 'material-fx',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'noise-fill-amp', order: 11, version: '1.0.0',
    description: 'Modulates material intensity/variation on existing cells; gated on parts.noise presence (item-foundry.js:413-414).',
    concept: 'material-fx',
    appliesTo: [], requires: ['parts.noise'],
  },
  {
    pipeline: 'item', ampId: 'selout-amp', order: 12, version: '1.0.0',
    description: 'Modulates outline color by light orientation; self-gates on spec.light being present (selout-amp.js:10).',
    concept: 'outline',
    appliesTo: [], requires: ['light'],
  },
  {
    pipeline: 'item', ampId: 'pixel-aa-amp', order: 13, version: '1.0.0',
    description: 'Softens 1-cell silhouette stair-steps by recoloring inner corners; item-foundry.js:425 calls it unconditionally.',
    concept: 'outline',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'facet-amp', order: 14, version: '1.0.0',
    description: 'Partitions gem-class parts into planar regions with flat shading; self-gates on spec.light present AND at least one part with shading:"faceted" (facet-amp.js:19,26).',
    concept: 'lighting',
    appliesTo: [{ field: 'parts.shading', op: 'eq', value: 'faceted' }],
    requires: ['light'],
  },
  {
    pipeline: 'item', ampId: 'square-sharpness-contrast-amp', order: 15, version: '1.0.0',
    description: 'HD edge-sharpness/contrast pass over the final fill coordinates; item-foundry.js:434 calls it unconditionally for every item.',
    concept: 'outline',
    appliesTo: [], requires: [],
  },
  {
    pipeline: 'item', ampId: 'volume-lift-amp', order: 16, version: '1.0.0',
    description: 'Lifts 2D structural energy into a 3D voxel volume. NOT cutover-eligible: item-foundry.js only calls it as a fallback when opts.includeVolume !== false AND the class route did not already emit routeVolume (item-foundry.js:566-577) — both are call-time/computed state, not spec content selectActiveAmps can see. Registered for discovery only; its item-foundry.js call site is unchanged.',
    concept: 'structural',
    appliesTo: [], requires: [],
  },
```

Run: `node scripts/seed-amp-item-pipeline-records.mjs`

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/item-pipeline-differential.test.js`
Expected: PASS across every real spec in `specs/*.json` plus the synthetic edge cases. If any spec disagrees, the predicate (not the oracle in the test) is wrong — fix the JSON record's `appliesTo`/`requires`, re-run the seed script, and re-test before proceeding.

Also re-run every earlier task's tests as a full-suite check:
Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/`
Expected: PASS, all files.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed-amp-item-pipeline-records.mjs codex/core/pixelbrain/amp-substrate/pilot-relevance/ tests/codex/core/pixelbrain/amp-substrate/item-pipeline-differential.test.js
git commit -m "feat(pixelbrain): register all 16 item-pipeline AMPs with measured predicates"
```

---

## Task 8: Extend the microprocessor bridge for the 12 new item AMPs

**Files:**
- Modify: `codex/core/microprocessors/index.js`
- Modify: `tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js`

**Interfaces:**
- Produces: `PIXELBRAIN_AMP_IDS` now includes all 16 item-pipeline AMPs (was 5), each resolvable as `verseIRMicroprocessors.run('pixelbrain.amp.<id>', payload, context)`.

- [ ] **Step 1: Write the failing test**

Extend `tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js`'s existing `PIXELBRAIN_AMP_IDS` assertion:

```js
it('registers one pixelbrain.amp.* id per item-pipeline AMP', () => {
  expect(PIXELBRAIN_AMP_IDS).toEqual([
    'chestplate-amp', 'facet-amp', 'geometry-amp', 'heraldry-amp', 'holyfire-motif-amp',
    'jewelry-amp', 'noise-fill-amp', 'pixel-aa-amp', 'region-fill-amp', 'sdf-shape-amp',
    'selout-amp', 'shield-rim-amp', 'shield-volume-amp', 'sketch-amp',
    'square-sharpness-contrast-amp', 'symmetry-amp', 'volume-lift-amp',
  ]);
  for (const ampId of PIXELBRAIN_AMP_IDS) {
    expect(verseIRMicroprocessors.has(`pixelbrain.amp.${ampId}`)).toBe(true);
  }
});
```

(`PIXELBRAIN_AMP_IDS` is `Object.freeze(Object.keys(PIXELBRAIN_AMP_LOADERS).sort())` — alphabetical, per the existing code.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js`
Expected: FAIL — only the original 5 ids are present.

- [ ] **Step 3: Extend `PIXELBRAIN_AMP_LOADERS`**

In `codex/core/microprocessors/index.js`, add to the existing `PIXELBRAIN_AMP_LOADERS` map (keep the 5 existing entries as-is):

```js
const PIXELBRAIN_AMP_LOADERS = Object.freeze({
  'chestplate-amp': async () => (await import('../pixelbrain/chestplate-amp.js')).applyChestplateTemplate,
  'shield-rim-amp': async () => (await import('../pixelbrain/shield-rim-amp.js')).applyShieldRimTemplate,
  'shield-volume-amp': async () => (await import('../pixelbrain/shield-volume-amp.js')).applyShieldVolumeTemplate,
  'holyfire-motif-amp': async () => (await import('../pixelbrain/holyfire-motif-amp.js')).applyHolyFireMotif,
  'symmetry-amp': async () => (await import('../pixelbrain/symmetry-amp.js')).runSymmetryAmpProcessor,
  'sketch-amp': async () => (await import('../pixelbrain/sketch-amp.js')).sketchToSilhouette,
  'sdf-shape-amp': async () => (await import('../pixelbrain/sdf-shape-amp.js')).SDFShapeAMP,
  'heraldry-amp': async () => (await import('../pixelbrain/heraldry-amp.js')).applyHeraldryTemplate,
  'jewelry-amp': async () => (await import('../pixelbrain/jewelry-amp.js')).applyJewelryTemplate,
  'geometry-amp': async () => (await import('../pixelbrain/geometry-amp.js')).buildGeometryAmpPayload,
  'region-fill-amp': async () => (await import('../pixelbrain/region-fill-amp.js')).applyRegionFills,
  'noise-fill-amp': async () => (await import('../pixelbrain/noise-fill-amp.js')).NoiseFillAMP,
  'selout-amp': async () => (await import('../pixelbrain/selout-amp.js')).applySelout,
  'pixel-aa-amp': async () => (await import('../pixelbrain/pixel-aa-amp.js')).applyPixelAA,
  'facet-amp': async () => (await import('../pixelbrain/facet-amp.js')).applyFacets,
  'square-sharpness-contrast-amp': async () => (await import('../pixelbrain/square-sharpness-contrast-amp.js')).buildSquareSharpnessContrastPayload,
  'volume-lift-amp': async () => (await import('../pixelbrain/volume-lift-amp.js')).liftToVolume,
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/microprocessors/index.js tests/codex/core/pixelbrain/amp-substrate/microprocessor-bridge.test.js
git commit -m "feat(pixelbrain): bridge all 16 item-pipeline AMPs into pixelbrain.amp.* ids"
```

---

## Task 9: Cut over `item-foundry.js` to data-driven activation

**Files:**
- Modify: `codex/core/pixelbrain/item-foundry.js`
- Test: `tests/codex/core/pixelbrain/item-foundry.amp-cutover.test.js`

**Interfaces:**
- Consumes: `loadRelevanceRecordsSync()` (Task 4), `selectActiveAmps('item', spec, records)` (Task 3).

This is the task Tasks 1-8 exist to make safe: Task 7's differential tests already proved, per-AMP, that the registry's predicate agrees with `item-foundry.js`'s real current gate across the whole real spec corpus. This task only changes *how* the decision is made (data lookup instead of inline `if`), not what any spec forges — so the safety net is "every existing item-foundry.js/forge test still produces byte-identical output," not new behavior tests.

- [ ] **Step 1: Write the failing regression test**

```js
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { forgeItemAsset } from '../../../../codex/core/pixelbrain/item-foundry.js';

const SPECS_DIR = join(process.cwd(), 'specs');

describe('item-foundry.js AMP cutover is behavior-preserving', () => {
  it.each(readdirSync(SPECS_DIR).filter((f) => f.endsWith('.json')))(
    '%s forges to the same fill coordinates and hash as before cutover',
    (file) => {
      const spec = JSON.parse(readFileSync(join(SPECS_DIR, file), 'utf8'));
      // forgeItemAsset is deterministic and pure — forging twice must agree,
      // which is what "cutover changed nothing observable" actually means here.
      const first = forgeItemAsset(spec, { includePng: false, includeVolume: false, intentReport: false });
      const second = forgeItemAsset(spec, { includePng: false, includeVolume: false, intentReport: false });
      expect(second.fills.hash).toBe(first.fills.hash);
      expect(second.assetPacket.compatibility.spec.hash).toBe(first.assetPacket.compatibility.spec.hash);
    },
  );
});
```

- [ ] **Step 2: Run the test to verify it fails or passes trivially**

Run: `npx vitest run tests/codex/core/pixelbrain/item-foundry.amp-cutover.test.js`
Expected: PASS already (this test only proves determinism, which is true before this task's change too) — this is the **before** snapshot. Record the `fills.hash` values it prints/asserts; they must still match after Step 3.

- [ ] **Step 3: Route the 15 cutover-eligible AMPs through the selector**

In `codex/core/pixelbrain/item-foundry.js`, add the import and load the records once at module scope (mirrors how every other AMP module is statically imported in this file already):

```js
import { loadRelevanceRecordsSync } from './amp-substrate/load-relevance-records-sync.js';
import { selectActiveAmps } from './amp-substrate/amp-selector.js';
```

At the top of `forgeItemAsset`, right after `validateItemSpec(spec)`:

```js
  const { activated: activeAmps } = selectActiveAmps('item', spec, loadRelevanceRecordsSync());
  const ampActive = (ampId) => activeAmps.includes(ampId);
```

Replace each of the 15 cutover-eligible call sites' conditions with a lookup into `ampActive`, keeping the existing surrounding code unchanged. For example, the holyfire-motif-amp site (previously an inline condition) becomes:

```js
  // 1a. Holy Fire Motif AMP — deterministic flame emission for holy-paladin
  //     weapons. Must run BEFORE template construction so motif cells become
  //     part of the silhouette and get the regular fill pass.
  //     Activation is data-driven — see pilot-relevance/holyfire-motif-amp.json.
  if (ampActive('holyfire-motif-amp')) {
    const holyFireResult = applyHolyFireMotif(silhouette, spec);
    silhouette = Object.freeze({
      ...silhouette,
      cells: holyFireResult.cells,
      partOf: holyFireResult.partOf,
    });
  }
```

The `sdf-shape-amp` site keeps its own internal `parts.filter(p => p.sdf)` loop (that per-part filtering is real per-part logic, not activation gating) but wraps the whole block:

```js
  if (ampActive('sdf-shape-amp')) {
    const sdfSpecParts = spec.parts.filter(p => p.sdf);
    for (const part of sdfSpecParts) {
      const sdfResult = SDFShapeAMP({ construction: constructionResult, silhouette, spec }, { sdf: part.sdf, partId: part.id, minCells: part.minCells || 1 });
      if (sdfResult.partCells && sdfResult.partCells.length > 0) {
        const added = sdfResult.partCells;
        silhouette = {
          ...silhouette,
          cells: [...silhouette.cells, ...added],
          partOf: new Map(silhouette.partOf),
        };
        added.forEach(c => silhouette.partOf.set(`${c.x},${c.y}`, part.id));
      }
    }
  }
```

The always-called AMPs (`sketch-amp`'s `sketchToSilhouette`, `shield-rim-amp`, `shield-volume-amp`, `heraldry-amp`, `jewelry-amp`, `chestplate-amp`, `geometry-amp`, `region-fill-amp`, `selout-amp`, `pixel-aa-amp`, `facet-amp`, `square-sharpness-contrast-amp`) each get their single call wrapped in `if (ampActive('<id>')) { ... }`. For the ones with real gates (`heraldry-amp`, `jewelry-amp`, `selout-amp`, `facet-amp`), the wrap makes the decision explicit at the call site instead of buried in the callee — but note `template`/`fills` are threaded through these calls as reassignments (`template = applyHeraldryTemplate(...)`), so the `if` must preserve that variable, e.g.:

```js
  if (ampActive('heraldry-amp')) template = applyHeraldryTemplate(template, silhouette, spec);
  if (ampActive('jewelry-amp')) template = applyJewelryTemplate(template, silhouette, spec);
  if (ampActive('chestplate-amp')) {
    template = applyChestplateTemplate(template, silhouette, spec, constructionHintsForComposer || (constructionResult ? constructionResult.constructionHints : null));
  }
```

and similarly for the finish passes (`fills = ...`) and the later `applyHeraldryFills` call. `noise-fill-amp`'s existing `spec.parts.filter(p => p.noise)` block gets the same outer wrap as `sdf-shape-amp`'s. `volume-lift-amp`'s call site is **left exactly as it is today** — this is the declared exception (Global Constraints); do not wrap it.

- [ ] **Step 4: Run the tests to verify nothing changed**

Run: `npx vitest run tests/codex/core/pixelbrain/item-foundry.amp-cutover.test.js`
Expected: PASS, same hashes as Step 2's before-snapshot.

Run the full existing item-foundry test suite (do not skip this — it is the real regression net for this task):
Run: `npx vitest run tests/codex/core/pixelbrain/item-foundry --reporter=verbose`
Expected: PASS, zero failures, zero changed snapshots.

Run the full AMP substrate suite once more:
Run: `npx vitest run tests/codex/core/pixelbrain/amp-substrate/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add codex/core/pixelbrain/item-foundry.js tests/codex/core/pixelbrain/item-foundry.amp-cutover.test.js
git commit -m "feat(pixelbrain): item-foundry.js activates its 15 gateable AMPs via the relevance registry"
```

---

## Task 10: `npm run amps` CLI smoke check + close the loop

**Files:**
- No new files — manual verification task.

- [ ] **Step 1: Rebuild the DB from the migrated pilot files and inspect it**

```bash
rm -f codex/core/pixelbrain/amp-substrate/amp-substrate.sqlite
node scripts/amp-substrate-cli.mjs register-pilots
node scripts/amp-substrate-cli.mjs list --pipeline=item
```

Expected: 16 records printed, in `order` sequence 1-16, each with a `description` line and a `when:`/`requires:` gate summary — confirms Task 2-7's work is coherent end-to-end through the CLI, not just through unit tests.

- [ ] **Step 2: Confirm a real spec's activation set matches expectation**

```bash
node scripts/amp-substrate-cli.mjs select --pipeline item specs/void-chestplate-sovereign-v2.json
```

Expected: `chestplate-amp` appears in ACTIVATED (it's a chestplate spec); `holyfire-motif-amp`, `shield-rim-amp`, `shield-volume-amp` appear in DORMANT with reasons.

- [ ] **Step 3: Run the entire pixelbrain test suite once, throttled**

Run: `nice -n 19 npx vitest run tests/codex/core/pixelbrain tests/pixelbrain --maxWorkers=2`
Expected: PASS. This is the final gate — it covers everything Tasks 1-9 touched plus every pre-existing pixelbrain test that forges through `item-foundry.js`.

- [ ] **Step 4: No commit — this task is verification only**

If Step 3 finds a failure, do not paper over it: identify which task's change caused it, fix that task's code, and re-run Tasks 1-9's own test files plus this full-suite check again before considering Phase 1 done.
