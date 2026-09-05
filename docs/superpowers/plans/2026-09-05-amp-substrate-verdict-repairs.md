# AMP Substrate Verdict Repairs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent the browser forge relevance registry from drifting from its tracked JSON records, and make `(pipeline, order)` admission atomic.

**Architecture:** Keep the browser-safe generated module as the forge input, but establish a disk-backed differential test that derives the selector rows from every checked-in JSON relevance record and compares them byte-for-byte structurally to the generated module. Run the database collision lookup and upsert in the wrapper transaction already provided by the persistence layer; checksum/schema validation remains outside the transaction because it performs no database operation.

**Tech Stack:** Node.js ESM, Vitest, better-sqlite3 through the repository persistence wrapper.

**Spec:** `/home/deck/.codex/attachments/b0f4b6ee-c3b2-48a4-8d83-e6f199dd20aa/pasted-text.txt`

## Global Constraints

- Preserve browser safety: no `node:*` import may enter the import graph from `item-foundry.js`.
- Preserve the generated module as a static source, but fail tests when it no longer represents `pilot-relevance/*.json`.
- Preserve `registerAmpRelevance(db, record)`'s public signature and existing collision error shape.
- Use `db.transaction()` for every SQL operation that enforces the order-uniqueness invariant.
- Do not modify the currently untested production specs or change forge activation behavior.

---

### Task 1: Guard generated selector rows against JSON drift

**Files:**
- Modify: `tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js`

**Interfaces:**
- Consumes: `loadRelevanceRecordsFromDir(dir)`, `GENERATED_RELEVANCE_RECORDS`.
- Produces: a regression test that fails whenever the on-disk JSON-derived selector rows differ from the generated browser module.

- [ ] **Step 1: Write the failing test**

```js
it('matches the selector rows derived from every checked-in pilot relevance JSON record', () => {
  const fromJson = loadRelevanceRecordsFromDir(PILOT_DIR);
  expect(canonicalSelectorRows(fromJson)).toEqual(canonicalSelectorRows(GENERATED_RELEVANCE_RECORDS));
});
```

Canonical ordering is `(pipeline, order, ampId)`: the directory loader correctly
orders filenames for deterministic reads, while the generated module retains its
authoritative forge execution ordering.

- [ ] **Step 2: Prove the test detects the failure mode**

Temporarily change one JSON predicate value, run:

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js
```

Expected: FAIL because the on-disk selector row differs from `GENERATED_RELEVANCE_RECORDS`. Restore the JSON edit before continuing.

- [ ] **Step 3: Keep the test as the durable enforcement**

Use the directory loader and generated module directly; the loader validates JSON checksums through the relevance-record schema before it emits selector rows.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate/load-relevance-records-sync.test.js
```

Expected: PASS.

### Task 2: Make order admission transactional

**Files:**
- Modify: `codex/core/pixelbrain/amp-substrate/amp-substrate.db.js`
- Modify: `tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js`

**Interfaces:**
- Consumes: `db.transaction(async () => {})` supplied by `createDbWrapper`.
- Produces: `registerAmpRelevance(db, record)` that performs the same-pipeline order collision check and upsert in one transaction.

- [ ] **Step 1: Write the failing transaction-boundary test**

```js
it('performs the order collision check and upsert in one transaction', async () => {
  const db = createTransactionSpyDb();
  await registerAmpRelevance(db, CHESTPLATE);
  expect(db.transactionCalls).toBe(1);
  expect(db.executions.every((execution) => execution.inTransaction)).toBe(true);
});
```

- [ ] **Step 2: Run it to verify RED**

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js
```

Expected: FAIL because the existing implementation does not call `db.transaction()`.

- [ ] **Step 3: Implement the smallest atomic change**

Wrap only the collision `SELECT`, collision error, and `INSERT ... ON CONFLICT` in:

```js
const [registered] = await db.transaction(async (tx) => {
  // collision SELECT and the existing upsert
});
return registered;
```

Return the existing `{ pipeline, ampId, checksum }` value from the transaction callback.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate/amp-substrate.db.test.js
```

Expected: PASS, including the pre-existing real SQLite collision tests.

### Task 3: Verify the complete touched surface

**Files:**
- Verify only.

- [ ] **Step 1: Run the AMP substrate suite**

```bash
npx vitest run tests/codex/core/pixelbrain/amp-substrate
```

- [ ] **Step 2: Run the production build**

```bash
npm run build
```

- [ ] **Step 3: Run the repository lint gate**

```bash
npm run lint
```

- [ ] **Step 4: Inspect the final diff**

```bash
git diff --check
git diff -- codex/core/pixelbrain/amp-substrate/amp-substrate.db.js tests/codex/core/pixelbrain/amp-substrate
```
