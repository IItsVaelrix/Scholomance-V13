# Lexical Graph Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an additive graph overlay to `scholomance_dict.sqlite` (lexical entries, relations, literary devices, FTS5, versioned TurboQuant) with dual-layer word mirroring, device seed, ops CLI, and a read-only adapter — without changing Lexicon Oracle’s `entry` authority or shipping Analyze UI.

**Architecture:** Dual-layer overlay in the existing dict DB. Pure helpers in `codex/core/lexical-graph/` own normalization, DDL, FTS sync, and seed validation. `scripts/lexical-graph.mjs` runs transactional migrate/mirror/seed-devices/embed-devices. `codex/server/adapters/lexicalGraph.sqlite.adapter.js` exposes read APIs with composite FTS cursors. `lexical_relation` is the only edge store.

**Tech Stack:** better-sqlite3, SQLite FTS5, Vitest, existing `quantizeVectorJS` / phonosemantic vector helpers, SCHEMA_CONTRACT.md

**Spec:** `docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md`

## Global Constraints

- Word ids: `le:word:<entry_id>` (never `le:word:<headword_lower>`)
- Device ids: `le:device:<slug>`
- `lexical_relation` sole edge authority; no `related_devices_json` / `commonly_confused_with_json` on `literary_device`
- Confusion ≠ contrast: use `commonly_confused_with` / `related_device` / `contrasts_with` exactly
- Embedding all-or-nothing CHECK; mirrored blobs use truthful `legacy_turboquant` + verified version or `unknown`
- `unknown` embeddings retrievable, `comparable: false`
- FTS pagination: composite `{ rank, rowid }` opaque cursor (not bare rowid)
- Detection signals: schema-valid, machine-addressable — no evaluator runtime in this slice
- Caller `--timestamp` required for write commands; no `Date.now()` for stamped fields
- One SQL transaction per CLI command; rollback on failure
- Do not modify `lexicon.sqlite.adapter.js` Oracle read paths
- No Analyze IDE UI in this plan

## File map

| Path | Responsibility |
|------|----------------|
| `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md` | Contract types + change notice (bump version) |
| `codex/core/lexical-graph/canonicalize.js` | `canonicalizeLower`, `wordEntryId`, shared constants |
| `codex/core/lexical-graph/schema.sql.js` | DDL string (tables, CHECKs, FKs, indexes, FTS) |
| `codex/core/lexical-graph/ftsSync.js` | `syncLexicalEntryFts`, `deleteLexicalEntry` |
| `codex/core/lexical-graph/seedValidate.js` | Validate device seed JSON before write |
| `codex/core/lexical-graph/deviceEmbed.js` | Deterministic phonosemantic → TurboQuant for devices |
| `codex/core/lexical-graph/legacyEmbedding.js` | Resolve verified legacy meta or `unknown` / omit |
| `codex/data/literary-devices/seed.v1.json` | Ten devices + relation declarations |
| `scripts/lexical-graph.mjs` | CLI: migrate \| mirror \| seed-devices \| embed-devices \| all |
| `codex/server/adapters/lexicalGraph.sqlite.adapter.js` | Read-only adapter |
| `tests/core/lexical-graph/*.test.js` | Unit tests for pure helpers |
| `tests/server/lexicalGraph.*.test.js` | Migration/mirror/seed/adapter integration |
| `package.json` | `lexical-graph` script |
| `docs/operations/DICT_BUILD.md` | Short ops note for graph overlay commands |

---

### Task 1: SCHEMA_CONTRACT — Lexical Graph shapes

**Files:**
- Modify: `docs/scholomance-encyclopedia/Scholomance LAW/SCHEMA_CONTRACT.md`
- Create: `codex/core/lexical-graph/types.js` (JSDoc typedefs mirroring contract; no runtime validation lib)

**Interfaces:**
- Produces: documented `LexicalEntry`, `LexicalRelation`, `LiteraryDevice`, `DetectionSignal`, supporting shapes; version bump 1.32 → 1.33

- [ ] **Step 1: Add SCHEMA CHANGE NOTICE + Core Schemas section**

Insert after the living-document version line (bump to **1.33**, date **2026-07-18**):

```markdown
## SCHEMA CHANGE NOTICE

- Schema: Lexical Graph Foundation (Analyze substrate)
- Version: 1.32 -> 1.33
- Date: 2026-07-18
- Changed fields: added `LexicalEntry`, `LexicalRelation`, `LiteraryDevice`, `DetectionSignal`, `Definition`, `EmotionalProfile`, `SemanticCoordinates`, `SourceReference`, `CraftPurpose`, `DeviceExample`, `LexicalEmbedding`, `FtsCursor`; relation enum includes `commonly_confused_with` and `related_device`
- Breaking: no — additive overlay; Oracle `entry` unchanged
- Owner: Codex
- Claude impact: none this slice (Analyze UI later)
- Gemini impact: dict migration/seed/adapter tests; fixture DBs may include overlay tables
- Error codes: reuse VALUE/STATE PB-ERR patterns for corrupt JSON / missing DB
```

Paste the interfaces from the design spec (including hydrated-only `relatedDevices` / `commonlyConfusedWith` on `LiteraryDevice`, and `LexicalEmbedding` with `comparable` as adapter-view field).

- [ ] **Step 2: Add `types.js` JSDoc**

```js
// codex/core/lexical-graph/types.js
/**
 * @typedef {'word'|'phrase'|'device'|'idiom'|'symbol'|'allusion'|'motif'} LexicalEntryType
 * @typedef {'synonym'|'antonym'|'rhymes_with'|'sounds_like'|'symbolizes'|'evokes'|'intensifies'|'contrasts_with'|'commonly_follows'|'example_of'|'used_with'|'commonly_confused_with'|'related_device'} LexicalRelationKind
 * @typedef {'token_repeat'|'syntactic_parallel'|'semantic_opposition'|'comparison_marker'|'line_position'|'semantic_incongruity'|'custom'} DetectionSignalKind
 */
export const LEXICAL_GRAPH_SCHEMA_VERSION = '1';
export const LITERARY_DEVICE_SEED_VERSION = '1';
export const DEVICE_EMBEDDING_KIND = 'phonosemantic_mock';
export const DEVICE_EMBEDDING_VERSION = 'tq-js-v1';
export const DEVICE_EMBEDDING_DIMENSIONS = 256;
export const LEGACY_EMBEDDING_KIND = 'legacy_turboquant';
```

- [ ] **Step 3: Commit**

```bash
git add docs/scholomance-encyclopedia/Scholomance\ LAW/SCHEMA_CONTRACT.md codex/core/lexical-graph/types.js
git commit -m "$(cat <<'EOF'
docs(schema): add Lexical Graph Foundation contract (v1.33)

EOF
)"
```

---

### Task 2: Canonicalization and word ids

**Files:**
- Create: `codex/core/lexical-graph/canonicalize.js`
- Test: `tests/core/lexical-graph/canonicalize.test.js`

**Interfaces:**
- Produces: `canonicalizeLower(value: string): string`, `wordLexicalId(entryId: number|string): string`, `deviceLexicalId(slug: string): string`

- [ ] **Step 1: Write failing tests**

```js
import { describe, it, expect } from 'vitest';
import { canonicalizeLower, wordLexicalId, deviceLexicalId } from '../../../codex/core/lexical-graph/canonicalize.js';

describe('canonicalizeLower', () => {
  it('NFC + en-US lower + collapse spaces', () => {
    expect(canonicalizeLower('  Grief\u00A0 Ceiling  ')).toBe('grief ceiling');
    expect(canonicalizeLower('\u212B')).toBe(canonicalizeLower('\u00C5')); // Å via NFC
  });
});

describe('ids', () => {
  it('word id uses entry_id not headword', () => {
    expect(wordLexicalId(42)).toBe('le:word:42');
    expect(deviceLexicalId('Antithesis')).toBe('le:device:antithesis');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npx vitest run tests/core/lexical-graph/canonicalize.test.js
```

Expected: FAIL module not found

- [ ] **Step 3: Implement**

```js
// codex/core/lexical-graph/canonicalize.js
export function canonicalizeLower(value) {
  let s = String(value ?? '').normalize('NFC');
  s = s.replace(/^[\s\u200B-\u200D\uFEFF]+|[\s\u200B-\u200D\uFEFF]+$/g, '');
  s = s.toLocaleLowerCase('en-US');
  s = s.replace(/\s+/g, ' ');
  return s;
}

export function wordLexicalId(entryId) {
  const n = Number(entryId);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`PB-ERR-v1-VALUE: invalid entry_id for wordLexicalId: ${entryId}`);
  }
  return `le:word:${n}`;
}

export function deviceLexicalId(slug) {
  const normalized = canonicalizeLower(slug).replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  if (!normalized) throw new Error('PB-ERR-v1-VALUE: empty device slug');
  return `le:device:${normalized}`;
}
```

- [ ] **Step 4: Run test — expect PASS**

```bash
npx vitest run tests/core/lexical-graph/canonicalize.test.js
```

- [ ] **Step 5: Commit**

```bash
git add codex/core/lexical-graph/canonicalize.js tests/core/lexical-graph/canonicalize.test.js
git commit -m "$(cat <<'EOF'
feat(lexical-graph): add canonicalizeLower and stable entry ids

EOF
)"
```

---

### Task 3: DDL + migrate command

**Files:**
- Create: `codex/core/lexical-graph/schema.sql.js` — export `LEXICAL_GRAPH_DDL` string
- Create: `codex/core/lexical-graph/migrate.js` — `migrateLexicalGraph(db, { timestamp })`
- Create: `scripts/lexical-graph.mjs` (stubs for other commands OK; implement `migrate` + arg parsing)
- Test: `tests/server/lexicalGraph.migrate.test.js`

**Interfaces:**
- Consumes: `LEXICAL_GRAPH_SCHEMA_VERSION` from types
- Produces: `migrateLexicalGraph(db, { timestamp: string }): void`

- [ ] **Step 1: Write failing migrate tests on fixture DB**

Reuse fixture pattern from `tests/server/lexicon.sqlite.adapter.test.js` (`entry` + `meta` tables). Assert:

1. After migrate: tables `lexical_entry`, `lexical_relation`, `literary_device`, `lexical_entry_fts`, `lexical_entry_fts_map` exist
2. `entry` COUNT unchanged
3. Inserting partial embedding (blob without kind) throws / CHECK fails
4. Inserting `definitions_json` as object `'{}'` fails CHECK
5. Re-running migrate is idempotent
6. Meta key `lexical_graph_schema_version` = `'1'`
7. Missing `--timestamp` equivalent: `migrateLexicalGraph(db, {})` throws

- [ ] **Step 2: Run — expect FAIL**

```bash
npx vitest run tests/server/lexicalGraph.migrate.test.js
```

- [ ] **Step 3: Implement DDL**

In `schema.sql.js`, include exactly:

- `lexical_entry` with type CHECK, word/entry_id CHECK, json_valid + json_type array/object CHECKs, **embedding all-or-nothing CHECK** from the spec
- `lexical_relation` with relation enum CHECK, strength 0–1, context_json null-or-array
- `literary_device` without edge JSON columns; array CHECKs on device JSON fields
- `lexical_entry_fts` FTS5 (`canonical_text`, `content`, unicode61, prefix 2 3 4)
- `lexical_entry_fts_map(rowid INTEGER PRIMARY KEY, entry_id TEXT NOT NULL UNIQUE, FOREIGN KEY(entry_id) REFERENCES lexical_entry(id) ON DELETE CASCADE)`
- Indexes per spec
- FKs: `entry_id` → `entry(id) ON DELETE CASCADE`; relation/device → `lexical_entry`

`migrateLexicalGraph`:

```js
export function migrateLexicalGraph(db, { timestamp } = {}) {
  if (typeof timestamp !== 'string' || !timestamp.trim()) {
    throw new Error('PB-ERR-v1-VALUE: migrate requires caller timestamp');
  }
  db.pragma('foreign_keys = ON');
  const tx = db.transaction(() => {
    db.exec(LEXICAL_GRAPH_DDL);
    db.prepare(
      `INSERT INTO meta(key, value) VALUES ('lexical_graph_schema_version', ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value`
    ).run(LEXICAL_GRAPH_SCHEMA_VERSION);
    // ensure meta table exists in fixtures — create IF NOT EXISTS meta(key PRIMARY KEY, value TEXT) in DDL preamble if missing
  });
  tx();
}
```

Wire CLI:

```bash
node scripts/lexical-graph.mjs migrate --db <path> --timestamp 2026-07-18T00:00:00.000Z
```

- [ ] **Step 4: Run tests — PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): add overlay DDL and migrate command

EOF
)"
```

---

### Task 4: FTS sync + delete order

**Files:**
- Create: `codex/core/lexical-graph/ftsSync.js`
- Test: `tests/core/lexical-graph/ftsSync.test.js` (uses temp DB + migrate)

**Interfaces:**
- Produces:
  - `syncLexicalEntryFts(db, entryId: string): void`
  - `deleteLexicalEntry(db, entryId: string): void` — deletes FTS virtual row **before** `DELETE FROM lexical_entry`

- [ ] **Step 1: Failing tests**

1. After insert entry + `syncLexicalEntryFts`, FTS MATCH finds canonical text
2. Update definitions + sync → new content searchable; old phrase not
3. `deleteLexicalEntry` removes FTS row and entry; map gone; no orphan FTS rowid
4. Deleting entry without prior FTS delete helper still safe when using `deleteLexicalEntry` only

- [ ] **Step 2: Implement**

```js
export function syncLexicalEntryFts(db, entryId) {
  const row = db.prepare(`SELECT id, canonical_text, definitions_json, type FROM lexical_entry WHERE id = ?`).get(entryId);
  if (!row) return;
  let content = row.canonical_text;
  // append definition texts + device aliases/definition if type=device
  const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get(entryId);
  if (map) {
    db.prepare(`UPDATE lexical_entry_fts SET canonical_text = ?, content = ? WHERE rowid = ?`)
      .run(row.canonical_text, content, map.rowid);
  } else {
    const info = db.prepare(`INSERT INTO lexical_entry_fts(canonical_text, content) VALUES (?, ?)`).run(row.canonical_text, content);
    db.prepare(`INSERT INTO lexical_entry_fts_map(rowid, entry_id) VALUES (?, ?)`).run(info.lastInsertRowid, entryId);
  }
}

export function deleteLexicalEntry(db, entryId) {
  const map = db.prepare(`SELECT rowid FROM lexical_entry_fts_map WHERE entry_id = ?`).get(entryId);
  if (map) {
    db.prepare(`DELETE FROM lexical_entry_fts WHERE rowid = ?`).run(map.rowid);
  }
  db.prepare(`DELETE FROM lexical_entry WHERE id = ?`).run(entryId);
  // map cascades via FK when entry deleted; if map remains (FTS deleted first), delete map explicitly:
  db.prepare(`DELETE FROM lexical_entry_fts_map WHERE entry_id = ?`).run(entryId);
}
```

When building content for devices, JOIN `literary_device` for aliases + definition.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): FTS sync with delete-before-entry ordering

EOF
)"
```

---

### Task 5: Mirror entries (dual-layer)

**Files:**
- Create: `codex/core/lexical-graph/legacyEmbedding.js`
- Create: `codex/core/lexical-graph/mirror.js` — `mirrorEntries(db, { timestamp })`
- Modify: `scripts/lexical-graph.mjs` — wire `mirror`
- Test: `tests/server/lexicalGraph.mirror.test.js`

**Interfaces:**
- Consumes: `wordLexicalId`, `canonicalizeLower`, `syncLexicalEntryFts`, `resolveLegacyEmbedding(db, entryRow)`
- Produces: `mirrorEntries(db, { timestamp: string }): { mirrored: number }`

- [ ] **Step 1: Failing tests**

1. Two `entry` rows with headword `grief` → ids `le:word:1` and `le:word:2`
2. `canonical_lower` matches `canonicalizeLower(headword)`
3. Blob present, no verified meta → either no copy OR `kind=legacy_turboquant`, `version=unknown`, `source=copied_from_entry`, dimensions from verified config only; if dimensions unknown → **no copy**
4. Partial embedding insert impossible (already covered); mirror never writes partial tuples
5. Meta `lexical_graph_mirrored_at` = provided timestamp; `lexical_graph_legacy_embedding_policy` set
6. Idempotent second mirror
7. `entry` rows unchanged

`resolveLegacyEmbedding` policy for foundation (document in code comment):

```js
// No verified turboquant version is published on entry rows today.
// Therefore: do NOT copy entry.embeddings_tq in default mirror (leave NULL),
// and set meta lexical_graph_legacy_embedding_policy = 'omit_unverified'.
// If future meta key turboquant_embedding_version exists and dimensions known,
// copy with kind=legacy_turboquant, version=<verified>, source=copied_from_entry.
```

Implement that default (omit unverified) so tests are honest — do not invent `unknown` dimensions.

Alternative allowed by spec: copy with `version=unknown` **only when dimensions verified**. Prefer omit if dimensions unverified.

- [ ] **Step 2: Implement mirror + CLI**

```js
export function mirrorEntries(db, { timestamp }) {
  if (!timestamp?.trim()) throw new Error('PB-ERR-v1-VALUE: mirror requires caller timestamp');
  db.pragma('foreign_keys = ON');
  return db.transaction(() => {
    const entries = db.prepare(`SELECT * FROM entry`).all();
    const upsert = db.prepare(`INSERT INTO lexical_entry (...) VALUES (...)
      ON CONFLICT(id) DO UPDATE SET ...`);
    let mirrored = 0;
    for (const e of entries) {
      const id = wordLexicalId(e.id);
      const emb = resolveLegacyEmbedding(db, e);
      upsert.run({ /* fields + emb or nulls */ created_at: timestamp, updated_at: timestamp });
      syncLexicalEntryFts(db, id);
      mirrored += 1;
    }
    // stamp meta
    return { mirrored };
  })();
}
```

Map `senses_json` → `definitions_json` as `[{ text: gloss }, ...]` extracting glosses like lexicon adapter.

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): mirror entry rows into lexical_entry by entry_id

EOF
)"
```

---

### Task 6: Literary device seed

**Files:**
- Create: `codex/data/literary-devices/seed.v1.json`
- Create: `codex/core/lexical-graph/seedValidate.js`
- Create: `codex/core/lexical-graph/seedDevices.js` — `seedLiteraryDevices(db, { timestamp, seedPath? })`
- Modify: `scripts/lexical-graph.mjs`
- Test: `tests/server/lexicalGraph.seedDevices.test.js`
- Test: `tests/core/lexical-graph/seedValidate.test.js`

**Interfaces:**
- Produces: seed file schema:

```json
{
  "seedVersion": "1",
  "devices": [
    {
      "slug": "antithesis",
      "name": "Antithesis",
      "aliases": ["antithetical pairing"],
      "definition": "...",
      "definitionsProvenance": [{ "source": "Scholomance craft notes", "license": "Project" }],
      "detectionSignals": [
        {
          "id": "antithesis.semantic_opposition",
          "kind": "semantic_opposition",
          "description": "Opposing ideas in parallel structure",
          "weight": 1,
          "parameters": { "requireParallelism": true },
          "scope": "line"
        }
      ],
      "purposes": [{ "id": "contrast", "description": "Sharpen opposition" }],
      "compatibleStructures": ["couplet", "parallel_clause"],
      "examples": [
        { "text": "It was the best of times, it was the worst of times.", "license": "Public Domain", "source": "Dickens" }
      ],
      "relations": [
        { "targetSlug": "juxtaposition", "relation": "commonly_confused_with", "strength": 0.9 },
        { "targetSlug": "paradox", "relation": "commonly_confused_with", "strength": 0.7 },
        { "targetSlug": "oxymoron", "relation": "related_device", "strength": 0.5 }
      ]
    }
  ]
}
```

Minimum devices (all ten): antithesis, juxtaposition, paradox, oxymoron, metaphor, simile, anaphora, volta, refrain, personification.

Confuse-set among antithesis/juxtaposition/paradox/oxymoron must use `commonly_confused_with` (bidirectional edges written by seeder). Do **not** use `contrasts_with` for that set unless a device explicitly asserts contrast in seed (none for foundation confuse-set).

- [ ] **Step 1: Failing validation tests**

- Missing example `license` → `seedValidate` throws
- Signal missing `kind` or `parameters` → throws
- Relation `contrasts_with` between antithesis and juxtaposition must **not** appear in committed seed; test asserts confuse edges only

- [ ] **Step 2: Failing seed integration tests**

- After migrate+seed: 10 `literary_device` rows
- No columns `related_devices_json` / `commonly_confused_with_json` (pragma table_info)
- Bidirectional `commonly_confused_with` between antithesis and juxtaposition
- FTS finds `antithesis` and alias text
- Idempotent re-seed
- Detection signals parse as arrays with `kind` + `weight` + `parameters`

- [ ] **Step 3: Implement validate + seed + write full seed.v1.json**

Seeder writes `lexical_entry` (`type=device`), `literary_device`, relations (for each declared edge, insert both directions when `symmetric !== false`), FTS sync. Fail transaction if validate fails.

- [ ] **Step 4: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): seed literary devices with relation-only edges

EOF
)"
```

---

### Task 7: Embed devices (TurboQuant)

**Files:**
- Create: `codex/core/lexical-graph/deviceEmbed.js`
- Create: `codex/core/lexical-graph/embedDevices.js`
- Modify: `scripts/lexical-graph.mjs`
- Test: `tests/server/lexicalGraph.embedDevices.test.js`

**Interfaces:**
- Consumes: `quantizeVectorJS` from `codex/core/quantization/turboquant.js`; prefer reusing `generatePhonosemanticVector` if exported from rhyme-astrology build helpers — if not exported, add `codex/core/lexical-graph/phonosemanticVector.js` with a **deterministic** 256-dim hash vector from canonical text + definition (document as phonosemantic_mock)
- Produces: `embedDevices(db, { timestamp }): { embedded: number }`

- [ ] **Step 1: Failing tests**

1. After seed+embed: each device has complete embedding tuple (`kind=phonosemantic_mock`, `version=tq-js-v1`, `dimensions=256`, `source=generated_device`, non-null blob)
2. Same timestamp + same text → identical blob on re-run (idempotent)
3. Meta stamps `lexical_graph_embedding_kind/version/dimensions` set
4. All-or-nothing still holds

- [ ] **Step 2: Implement**

```js
import { quantizeVectorJS } from '../quantization/turboquant.js';
import { DEVICE_EMBEDDING_KIND, DEVICE_EMBEDDING_VERSION, DEVICE_EMBEDDING_DIMENSIONS } from './types.js';

export function buildDeviceEmbeddingBlob(canonicalText, definition) {
  const vector = generateDeterministicUnitVector(`${canonicalText}\n${definition}`, DEVICE_EMBEDDING_DIMENSIONS);
  const { data, norm } = quantizeVectorJS(vector, 42);
  const buf = Buffer.alloc(4 + data.length);
  buf.writeFloatLE(norm, 0);
  Buffer.from(data).copy(buf, 4);
  return buf;
}
```

Pack format matches rhyme-astrology (`[float32 norm LE][packed]`).

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): embed literary devices with versioned TurboQuant tuples

EOF
)"
```

---

### Task 8: Read-only lexicalGraph adapter

**Files:**
- Create: `codex/server/adapters/lexicalGraph.sqlite.adapter.js`
- Test: `tests/server/lexicalGraph.adapter.test.js`

**Interfaces:**
- Produces: `createLexicalGraphAdapter(dbPath, options?)` with methods:
  - `getEntryById(id)`
  - `getEntryByCanonical(text, type?)` → array (limit default 50)
  - `getEntryByEntryId(entryId)`
  - `searchFts(query, { types?, limit?, cursor? })` → `{ results, nextCursor }`
  - `listRelations(sourceId, { relation?, limit?, cursor? })` → `{ results, nextCursor }`
  - `getLiteraryDevice(id)` — hydrates related/confused from relations
  - `listLiteraryDevices({ confuseWith?, limit?, cursor? })`
  - `getEmbedding(id)` → `{ blob, kind, version, dimensions, source, comparable }` or null
  - `close()`
  - Degraded empty adapter when DB missing (like lexicon adapter)

- [ ] **Step 1: Failing adapter tests** on migrate+mirror+seed+embed fixture

1. `getEntryByEntryId(1)` → `le:word:1`
2. `getLiteraryDevice('le:device:antithesis')` returns hydrated `commonlyConfusedWith` including juxtaposition; `relatedDevices` as seeded
3. `searchFts('antithesis')` returns device; second page with `nextCursor` works (insert enough FTS rows or use limit=1)
4. Cursor is opaque string; decoding private — two-page walk returns disjoint ids
5. `getEmbedding(deviceId).comparable === true`; if test inserts a legacy unknown tuple manually, `comparable === false`
6. Missing DB path → methods return null/[] without throw

**FTS query shape (bm25 polarity):**

```sql
SELECT m.entry_id AS id, bm25(lexical_entry_fts) AS rank, f.rowid AS rowid
FROM lexical_entry_fts f
JOIN lexical_entry_fts_map m ON m.rowid = f.rowid
JOIN lexical_entry e ON e.id = m.entry_id
WHERE lexical_entry_fts MATCH ?
  AND (? types filter ...)
  AND (
    ? cursor IS NULL
    OR bm25(lexical_entry_fts) > ?
    OR (bm25(lexical_entry_fts) = ? AND f.rowid > ?)
  )
ORDER BY rank ASC, f.rowid ASC
LIMIT ?
```

Encode cursor: `Buffer.from(JSON.stringify({ rank, rowid })).toString('base64url')`.

Reuse FTS sanitize logic equivalent to `sanitizeFtsQuery` in lexicon adapter (copy into shared helper under `codex/core/lexical-graph/ftsQuery.js` to avoid importing server adapter internals — do **not** modify lexicon adapter).

- [ ] **Step 2: Implement adapter**

- [ ] **Step 3: Tests PASS + commit**

```bash
git commit -m "$(cat <<'EOF'
feat(lexical-graph): add read-only SQLite adapter with composite FTS cursors

EOF
)"
```

---

### Task 9: CLI `all`, npm script, ops docs

**Files:**
- Modify: `scripts/lexical-graph.mjs` — implement `all` = migrate → mirror → seed-devices → embed-devices (each own transaction)
- Modify: `package.json` — add `"lexical-graph": "node scripts/lexical-graph.mjs"`
- Modify: `docs/operations/DICT_BUILD.md` — add section “Lexical graph overlay”

- [ ] **Step 1: Integration test** `tests/server/lexicalGraph.all.test.js`

Run programmatic `all` on temp fixture with 2 same-headword entries + assert final counts (2 word nodes, 10 devices, embeddings present, oracle `entry` intact).

- [ ] **Step 2: Wire CLI help + package script**

```json
"lexical-graph": "node scripts/lexical-graph.mjs"
```

Docs snippet:

```markdown
## Lexical graph overlay (Analyze foundation)

```bash
npm run lexical-graph -- migrate --db scholomance_dict.sqlite --timestamp 2026-07-18T00:00:00.000Z
npm run lexical-graph -- all --db scholomance_dict.sqlite --timestamp 2026-07-18T00:00:00.000Z
```

Does not replace Oracle `entry` tables. See `docs/superpowers/specs/2026-07-18-lexical-graph-foundation-design.md`.
```

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
chore(lexical-graph): wire CLI all-command and DICT_BUILD ops note

EOF
)"
```

---

### Task 10: Regression gate + immunity

**Files:**
- Touch only if needed for test discovery
- Verify: `tests/server/lexicon.sqlite.adapter.test.js` unchanged behavior

- [ ] **Step 1: Run focused + lexicon regression**

```bash
npx vitest run tests/core/lexical-graph tests/server/lexicalGraph tests/server/lexicon.sqlite.adapter.test.js
```

Expected: all PASS

- [ ] **Step 2: Immunity scan on new files** (MCP `immunity_scan` or project script if available) for each new path under `codex/core/lexical-graph/`, adapter, script

- [ ] **Step 3: Mark design acceptance checklist mentally against plan deliverables; fix any gap found

- [ ] **Step 4: Final commit if fixes needed; otherwise done

---

## Spec coverage checklist (plan self-review)

| Spec requirement | Task |
|------------------|------|
| Overlay DDL + CHECKs + FKs | 3 |
| Embedding all-or-nothing | 3, 7 |
| `le:word:<entry_id>` | 2, 5 |
| Dual-layer mirror + truthful legacy embeddings | 5 |
| Device seed + licenses + machine-addressable signals | 6 |
| Relations authoritative; confuse ≠ contrast | 6, 8 |
| FTS sync + delete-before-entry + map FK | 4 |
| Composite FTS cursor | 8 |
| TurboQuant device embed + meta stamps | 7 |
| Adapter read API + pagination | 8 |
| Caller timestamp + one txn/command | 3–7, 9 |
| SCHEMA_CONTRACT | 1 |
| Oracle adapter untouched | 10 |
| No Analyze UI | (global — no UI tasks) |

## Placeholder scan

No TBD steps. Seed content for all ten devices must be authored in Task 6 (full JSON in repo — do not leave stubs).

## Type consistency

- Ids: `wordLexicalId` / `deviceLexicalId` only
- Embedding view field `comparable` only on adapter `getEmbedding` return, not DB column
- Relation kinds match SCHEMA_CONTRACT enum including `commonly_confused_with` and `related_device`
