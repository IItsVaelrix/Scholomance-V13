# Lexical Graph Foundation — Design

**Date:** 2026-07-18  
**Status:** Approved for implementation  
**Note:** User directed single-agent ownership for schema, migration, seed, adapter, tests, SCHEMA_CONTRACT, and subsequent Analyze slices after this foundation ships.  
**Bytecode:** `SCHOL-ENC-BYKE-SEARCH-LEXICAL-GRAPH-FOUNDATION`  
**Slice:** Foundation only (schema + TurboQuant/FTS5 storage)  
**Implementation ownership:** Single agent executes schema, migration, seed, adapter, tests, and SCHEMA_CONTRACT proposal (no multi-agent handoff required for this slice).

## North star (full product — not this slice)

Transform the Read IDE **Analyze** panel into a submit-only poetic search engine that pairs with Lexicon Oracle. Users query words, phrases, concepts, craft functions, sound constraints, structural techniques, and transformations. Results are organized, evidence-backed possibilities across Meaning, Related language, Oppositions, Sound, Phrases, Literary techniques, Symbols, Corpus examples, and Craft actions.

**Boundaries (full product):**

| Surface | Job |
|---------|-----|
| Analyze | What language and techniques are available? |
| TrueSight | What is this draft currently doing? |
| Scribe | Where do I apply the result? |
| Visualizer | What patterns exist across the work? |
| Lexicon Oracle | Definitions, synonyms, antonyms, rhyme families (authority for words) |

**Deferred after this foundation** (see [Follow-on slices](#follow-on-slices-ordered)): word relation bridge, phrase/motif/symbol/allusion ingest, Analyze retrieval, Analyze UI, semantic trajectory, Nexus, Oracle cutover.

---

## Problem

Analyze today (`AnalysisPanel`) reports draft phonetics/heuristics. It is not a navigable language graph. Lexicon Oracle already uses `scholomance_dict.sqlite` (`entry` + `entry_fts` + `embeddings_tq`), but that schema is headword-centric and cannot host devices, motifs, typed relations, or a unified FTS/TurboQuant surface for non-word craft nodes.

## Goal (this slice)

Extend **`scholomance_dict.sqlite`** with an additive **graph overlay**:

1. Dual-layer: `entry` remains Lexicon Oracle authority (unchanged read paths).
2. Mirror words into `lexical_entry` (`type=word`) linked by `entry_id`, with **stable ids** `le:word:<entry_id>`.
3. Seed a curated literary-device catalog into `literary_device` + `lexical_entry` (`type=device`).
4. Graph FTS5 (`lexical_entry_fts`) for exact/textual search over graph nodes.
5. Versioned TurboQuant storage on graph nodes (blob + metadata columns).
6. Read-only graph adapter + tests. No Analyze UI.
7. **`lexical_relation` is the sole authority** for typed edges; device hydration assembles related/confused lists from relations.

## Decisions locked

| Decision | Choice |
|----------|--------|
| Build order | Foundation storage first (not UI-first) |
| Database | Extend `scholomance_dict.sqlite` (no disconnected second dictionary) |
| Populate | Schema + word mirror + literary device seed |
| Legacy link | Dual-layer: `entry` stays Oracle authority; mirror into graph |
| Architecture | Additive graph overlay (Approach 1) |
| Word identity | `le:word:<entry_id>` (immutable legacy key); spelling via `canonical_*` |
| Relation authority | `lexical_relation` only; no duplicated device JSON edge lists |
| Confusion vs contrast | Distinct relation types; confusion ≠ contrast |

---

## Out of scope

- Analyze IDE search UI, result groups, craft actions (Insert/Replace/Pin/…)
- Ranking formula (`lexicalMatch + contextualFit + …`)
- Semantic trajectory matching (“betrayal disguised as love”)
- Nexus search-first expanded results page
- WordNet → graph synonym/antonym bridge (follow-on slice 2)
- Bulk ingest of phrases, motifs, symbols, allusions (follow-on slice 3)
- Replacing or cutting over Oracle off `entry`
- Typing-triggered retrieval (UI law for later slice: search on submit only)
- Forcing recompute of all ~134k word TurboQuant vectors unless explicitly flagged
- Runtime device detector registry in TrueSight (catalog stores schema-valid, machine-addressable signals; evaluators land later)

---

## Schema

All new tables live in `scholomance_dict.sqlite`. Legacy `entry`, `entry_fts`, `rhyme_index`, WordNet tables remain as-is.

### Identity rules

| Node kind | `id` form | Notes |
|-----------|-----------|--------|
| Word (mirrored) | `le:word:<entry_id>` | One graph node per legacy `entry` row. Identity ≠ spelling. Multiple senses/pronunciations/sources for the same headword get distinct ids. |
| Device | `le:device:<slug>` | Stable slug from seed file (e.g. `antithesis`) |
| Future types | `le:<type>:<stable_key>` | Defined when ingest slices land |

`canonical_text` / `canonical_lower` are for **display and lookup**, never primary identity for words.

### Unicode normalization for `canonical_lower`

Documented algorithm (must be shared by mirror, seed, and adapter):

1. `String(value).normalize('NFC')`
2. Trim leading/trailing Unicode whitespace (`\s` + strip ZW* if present at ends)
3. Lowercase with `toLocaleLowerCase('en-US')`
4. Collapse internal runs of whitespace to a single ASCII space `U+0020`
5. Store result in `canonical_lower`; never store a different normalization than callers use for lookup

### `lexical_entry`

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PRIMARY KEY | See identity rules |
| `type` | TEXT NOT NULL | CHECK ∈ word/phrase/device/idiom/symbol/allusion/motif |
| `canonical_text` | TEXT NOT NULL | Display head |
| `canonical_lower` | TEXT NOT NULL | Normalized via algorithm above |
| `entry_id` | INTEGER NULL | FK → `entry.id` ON DELETE CASCADE; UNIQUE when non-null; required when `type='word'` |
| `definitions_json` | TEXT NOT NULL | Array; CHECK `json_valid` AND `json_type = 'array'` |
| `phonemes_json` | TEXT NULL | When non-null: array CHECK (`json_valid` AND `json_type = 'array'`) |
| `syllable_count` | INTEGER NULL | |
| `stress_pattern` | TEXT NULL | |
| `emotional_profile_json` | TEXT NOT NULL DEFAULT `'{}'` | Object; CHECK `json_valid` AND `json_type = 'object'` |
| `semantic_coordinates_json` | TEXT NOT NULL DEFAULT `'{}'` | Object; CHECK `json_valid` AND `json_type = 'object'`; storage only |
| `register_json` | TEXT NOT NULL DEFAULT `'[]'` | Array; CHECK `json_valid` AND `json_type = 'array'` |
| `domains_json` | TEXT NOT NULL DEFAULT `'[]'` | Array; CHECK `json_valid` AND `json_type = 'array'` |
| `provenance_json` | TEXT NOT NULL | Array; CHECK `json_valid` AND `json_type = 'array'` |
| `embeddings_tq` | BLOB NULL | TurboQuant payload |
| `embedding_kind` | TEXT NULL | See embedding integrity |
| `embedding_version` | TEXT NULL | Verified version, or `unknown` for legacy copies |
| `embedding_dimensions` | INTEGER NULL | Must be `> 0` when blob present |
| `embedding_source` | TEXT NULL | `copied_from_entry` \| `generated_device` \| future model ids |
| `created_at` | TEXT NOT NULL | ISO from **caller-provided migration timestamp** |
| `updated_at` | TEXT NOT NULL | Same rule — no scattered `Date.now()` inside row loops |

**CHECK — type / entry_id:** if `type = 'word'` then `entry_id IS NOT NULL`; if `type != 'word'` then `entry_id IS NULL`.

**CHECK — embedding all-or-nothing integrity** (mandatory):

```sql
CHECK (
  (
    embeddings_tq IS NULL
    AND embedding_kind IS NULL
    AND embedding_version IS NULL
    AND embedding_dimensions IS NULL
    AND embedding_source IS NULL
  )
  OR
  (
    embeddings_tq IS NOT NULL
    AND embedding_kind IS NOT NULL
    AND embedding_version IS NOT NULL
    AND embedding_dimensions > 0
    AND embedding_source IS NOT NULL
  )
)
```

**Indexes:** `(type, canonical_lower)`, `canonical_lower`, UNIQUE(`entry_id`) WHERE `entry_id IS NOT NULL`.

### `lexical_relation` (authoritative edges)

| Column | Type | Notes |
|--------|------|--------|
| `id` | INTEGER PRIMARY KEY AUTOINCREMENT | |
| `source_id` | TEXT NOT NULL | FK → `lexical_entry.id` ON DELETE CASCADE |
| `target_id` | TEXT NOT NULL | FK → `lexical_entry.id` ON DELETE CASCADE |
| `relation` | TEXT NOT NULL | CHECK ∈ relation enum |
| `strength` | REAL NOT NULL | CHECK `strength >= 0 AND strength <= 1` |
| `context_json` | TEXT NULL | When non-null: array CHECK (`json_valid` AND `json_type = 'array'`) |

**Relation enum:**

```
synonym | antonym | rhymes_with | sounds_like | symbolizes | evokes
| intensifies | contrasts_with | commonly_follows | example_of | used_with
| commonly_confused_with | related_device
```

- `commonly_confused_with` — learners/tools often mis-tag these as each other; **not** semantic opposition.
- `related_device` — pedagogical/craft adjacency without claiming confusion or contrast.
- `contrasts_with` — genuine oppositional/contrastive relationship only.

**Constraint:** UNIQUE `(source_id, target_id, relation)`.

Indexes on `source_id`, `target_id`, `(relation, source_id)`.

### `literary_device`

First-class craft detail. `id` equals owning `lexical_entry.id`. **Does not store edge lists** — relations live only in `lexical_relation`.

| Column | Type | Notes |
|--------|------|--------|
| `id` | TEXT PRIMARY KEY | FK → `lexical_entry.id` ON DELETE CASCADE |
| `name` | TEXT NOT NULL | |
| `aliases_json` | TEXT NOT NULL | Array; CHECK `json_valid` AND `json_type = 'array'` |
| `definition` | TEXT NOT NULL | |
| `detection_signals_json` | TEXT NOT NULL | `DetectionSignal[]`; CHECK `json_valid` AND `json_type = 'array'` |
| `purposes_json` | TEXT NOT NULL | `CraftPurpose[]`; CHECK `json_valid` AND `json_type = 'array'` |
| `compatible_structures_json` | TEXT NOT NULL | string[]; CHECK `json_valid` AND `json_type = 'array'` |
| `examples_json` | TEXT NOT NULL | `DeviceExample[]`; CHECK `json_valid` AND `json_type = 'array'` |

Seed writes confuse/related edges as `lexical_relation` rows (`commonly_confused_with`, `related_device`) — bidirectional where the seed declares symmetry.

### `lexical_entry_fts` + map

FTS5 virtual table (mirrored insert pattern, same as `entry_fts` tests — not `content=` external):

- Columns: `canonical_text`, `content` (definitions + device aliases/definition text)
- `tokenize='unicode61'`, `prefix='2 3 4'`
- Map: `lexical_entry_fts_map(
    rowid INTEGER PRIMARY KEY,
    entry_id TEXT NOT NULL UNIQUE,
    FOREIGN KEY (entry_id) REFERENCES lexical_entry(id) ON DELETE CASCADE
  )`

**FTS sync rules (mandatory):**

| Graph write | FTS action |
|-------------|------------|
| INSERT `lexical_entry` | Allocate rowid, INSERT map + FTS row |
| UPDATE canonical/definitions/device text | UPDATE FTS content for mapped rowid; never orphan map |
| DELETE `lexical_entry` | **First** DELETE the FTS5 virtual row by `map.rowid`; **then** DELETE `lexical_entry` (map row cascades via FK). Never delete the graph entry while the FTS virtual row still exists. |
| Re-seed / re-mirror upsert | Upsert entry then refresh FTS for that `entry_id` only |

Adapter and scripts share one `syncLexicalEntryFts(db, entryId)` helper so paths cannot diverge. Shared `deleteLexicalEntry(db, entryId)` must enforce FTS-then-entry order inside the same transaction.

### Embedding metadata

Blob alone is insufficient. The all-or-nothing CHECK above forbids partial embedding rows.

| Field | Purpose |
|-------|---------|
| `embedding_kind` | Codec family |
| `embedding_version` | Exact quantizer/version stamp, or `unknown` |
| `embedding_dimensions` | Integer dimension (`> 0` when present) |
| `embedding_source` | Provenance |

**Legacy mirror truthfulness:** `mirror` MUST NOT invent version metadata for existing `entry.embeddings_tq` blobs. It must either:

1. Retrieve **verified** kind/version/dimensions from existing database meta or TurboQuant configuration known to have produced those blobs, or
2. Stamp honestly:

```
embedding_kind = 'legacy_turboquant'
embedding_version = <verified version> | 'unknown'
embedding_dimensions = <verified dimensions>   -- required (>0); from verified config or blob-length contract
embedding_source = 'copied_from_entry'
```

If dimensions cannot be verified, the blob MUST NOT be copied (leave all embedding columns NULL) rather than inventing a dimension. Prefer verified config; fall back to omitting the copy.

**Similarity eligibility (later ranking consumers; foundation stores the contract):**

- Retrievable: any row with a complete embedding tuple (including `version='unknown'`).
- Eligible for similarity comparison: same `embedding_kind`, same `embedding_version`, `embedding_version != 'unknown'`, and matching `embedding_dimensions`.
- Refuse comparison across kind/version/dimension mismatches or when either side is `unknown`.

**Generated device embeddings** (`embed-devices`): use the current TurboQuant path with explicit stamps, e.g. `embedding_kind='phonosemantic_mock'` (or verified current kind), `embedding_version=<known>`, `embedding_source='generated_device'`.

**DB meta stamps** (in `meta` table):

- `lexical_graph_schema_version`
- `lexical_graph_mirrored_at` (caller-provided ISO timestamp used for the run)
- `literary_device_seed_version`
- `lexical_graph_embedding_kind` — stamp for **newly generated** device embeddings in this run
- `lexical_graph_embedding_version`
- `lexical_graph_embedding_dimensions`
- `lexical_graph_legacy_embedding_policy` — `omit_unverified` | `verified:<version>` | `unknown` documenting how mirrored copies were labeled

### Contract types (SCHEMA_CONTRACT proposal)

```ts
interface LexicalEntry {
  id: string;
  type: "word" | "phrase" | "device" | "idiom" | "symbol" | "allusion" | "motif";
  canonicalText: string;
  definitions: Definition[];
  phonemes?: string[];
  syllableCount?: number;
  stressPattern?: string;
  emotionalProfile: EmotionalProfile;
  semanticCoordinates: SemanticCoordinates;
  register: string[];
  domains: string[];
  provenance: SourceReference[];
  entryId?: number | null;
  embedding?: {
    blob: Uint8Array;
    kind: string;
    version: string;
    dimensions: number;
    source: string;
  } | null;
}

interface LexicalRelation {
  sourceId: string;
  targetId: string;
  relation:
    | "synonym" | "antonym" | "rhymes_with" | "sounds_like"
    | "symbolizes" | "evokes" | "intensifies" | "contrasts_with"
    | "commonly_follows" | "example_of" | "used_with"
    | "commonly_confused_with" | "related_device";
  strength: number;
  context?: string[];
}

interface LiteraryDevice {
  id: string;
  name: string;
  aliases: string[];
  definition: string;
  detectionSignals: DetectionSignal[];
  purposes: CraftPurpose[];
  compatibleStructures: string[];
  examples: DeviceExample[];
  /** Hydrated from lexical_relation; not persisted on literary_device */
  relatedDevices: string[];
  commonlyConfusedWith: string[];
}

interface DetectionSignal {
  id: string;
  kind:
    | "token_repeat"
    | "syntactic_parallel"
    | "semantic_opposition"
    | "comparison_marker"
    | "line_position"
    | "semantic_incongruity"
    | "custom";
  description: string;
  weight: number;
  parameters: Record<string, unknown>;
  scope?: "token" | "line" | "stanza" | "document";
}
```

This slice stores **schema-valid, machine-addressable** detection signals. It does **not** ship a runtime that executes every `kind`. When TrueSight lands a detector registry, those signals become demonstrably executable:

```ts
type DetectionEvaluatorRegistry = {
  [K in DetectionSignal["kind"]]: (
    signal: Extract<DetectionSignal, { kind: K }>,
    context: AnalysisContext
  ) => DetectionEvidence[];
};
```

### Minimal supporting shapes

| Type | Required fields |
|------|-----------------|
| `Definition` | `text: string`; optional `sense?`, `register?`, `source?` |
| `EmotionalProfile` | optional numeric `valence` ∈ [-1,1]; `intensity`, `tension`, `vulnerability`, `hostility` ∈ [0,1] |
| `SemanticCoordinates` | object bag (opaque to storage; calculus consumers interpret later) |
| `SourceReference` | `source: string`; optional `url?`, `license?` (license **required** on seeded device definitions/examples) |
| `CraftPurpose` | `id: string`, `description: string` |
| `DeviceExample` | `text: string`; `license: string`; optional `source?`, `note?` |

---

## Migration, seed, and TurboQuant

Offline/ops pipeline (idempotent). Single entrypoint:

`node scripts/lexical-graph.mjs <command> [--db PATH] [--timestamp ISO8601]`

`--timestamp` is **required** for commands that write `created_at` / `updated_at` / meta times. Scripts must not call the system clock for stamped fields. Omit only for read-only diagnostics.

| Command | Behavior |
|---------|----------|
| `migrate` | One transaction: create overlay tables, CHECKs, FKs (`PRAGMA foreign_keys=ON`), indexes, FTS, fts map; never drop legacy tables; rollback on any failure |
| `mirror` | One transaction: upsert `lexical_entry` per `entry` with `id=le:word:<entry.id>`; if `entry.embeddings_tq` present, copy only with **truthful** legacy metadata (verified version or `legacy_turboquant` + `unknown`; never invent); if dimensions unverified, leave all embedding columns NULL; sync FTS; stamp meta including `lexical_graph_legacy_embedding_policy` |
| `seed-devices` | One transaction: load curated JSON from `codex/data/literary-devices/` → upsert `lexical_entry` + `literary_device` + FTS; write **only** `lexical_relation` edges (`commonly_confused_with`, `related_device`, and `contrasts_with` only when the seed explicitly asserts contrast); provenance/license required on definitions and examples; detection signals must be schema-valid and machine-addressable |
| `embed-devices` | One transaction: for device nodes missing blobs, generate via TurboQuant phonosemantic mock path; set complete embedding tuple (`kind`, `version` ≠ invented unknowns when known, `dimensions`, `source='generated_device'`); update meta embedding stamps; determinism: same canonical text + definition + embedding_version → same blob |
| `all` | Runs the four commands sequentially; each command is its own transaction |

Optional later flag on `mirror`: `--recompute-missing-tq` (not required for acceptance).

**Foreign keys / deletion:**

- `lexical_entry.entry_id` → `entry.id` **ON DELETE CASCADE** (legacy entry removal removes mirror node)
- `lexical_relation.source_id` / `target_id` → `lexical_entry.id` **ON DELETE CASCADE**
- `literary_device.id` → `lexical_entry.id` **ON DELETE CASCADE**
- FTS map/rows removed in the same transaction via shared sync helper (FTS5 virtual tables do not enforce FK)

**Word mirror rule:** one `lexical_entry` per `entry` row; `id = le:word:<entry_id>`; `canonical_*` from headword via normalization algorithm; provenance cites CMU/OEWN/`entry` source fields. No writes back into `entry`.

**Device seed rule (minimum catalog):** antithesis, juxtaposition, paradox, oxymoron, metaphor, simile, anaphora, volta, refrain, personification — each with schema-valid, machine-addressable `DetectionSignal`s, purposes, licensed examples, and relation edges. Confuse-set among antithesis/juxtaposition/paradox/oxymoron uses `commonly_confused_with`, not `contrasts_with`.

**Licensing / provenance for seeds:** every seeded definition and example MUST include `SourceReference` / `DeviceExample.license` (e.g. original Scholomance craft notes under project license, or cited public-domain/CC text). Seed load fails the transaction if any example lacks license.

**Oracle safety:** existing `lexicon.sqlite.adapter.js` read paths unchanged in this slice.

---

## Adapter API

New module: `codex/server/adapters/lexicalGraph.sqlite.adapter.js`.

Read-only in this slice (writes only via migration/seed scripts):

| Method | Behavior |
|--------|----------|
| `getEntryById(id)` | Full `LexicalEntry` or null |
| `getEntryByCanonical(text, type?)` | Exact `canonical_lower` match (may return multiple if type omitted and duplicates exist across types; default limit applies) |
| `getEntryByEntryId(entryId)` | Dual-layer bridge → `le:word:<entryId>` |
| `searchFts(query, { types?, limit, cursor? })` | FTS5 only; sanitized; relevance-ordered with **composite opaque cursor** (see below) |
| `listRelations(sourceId, { relation?, limit, cursor? })` | Typed edges; paginated by relation `id` ascending (stable) |
| `getLiteraryDevice(id)` | Device row + **hydrated** `relatedDevices` / `commonlyConfusedWith` from `lexical_relation` |
| `listLiteraryDevices({ confuseWith?, limit, cursor? })` | Catalog helpers; paginated |
| `getEmbedding(id)` | Complete embedding tuple or null; includes `comparable: boolean` (`false` when `version === 'unknown'`) |

Default page size bounded (e.g. 50); max hard cap (e.g. 200).

**FTS cursor contract (foundation):** results are ordered by relevance (`bm25` or equivalent), not storage order. A bare rowid cursor is invalid. Use a composite opaque cursor:

```ts
interface FtsCursor {
  rank: number;
  rowid: number;
}

// searchFts(query, { types?, limit, cursor?: string /* encode(FtsCursor) */ })
// WHERE (bm25(...) > cursor.rank)
//    OR (bm25(...) = cursor.rank AND rowid > cursor.rowid)
// ORDER BY bm25(...) ASC, rowid ASC   -- adjust ASC/DESC to match chosen rank polarity
```

Encode/decode is adapter-private; callers treat `cursor` as an opaque string.

Missing DB → adapter unavailable (degraded), not process crash. Corrupt JSON → PB-ERR-v1 VALUE/STATE errors. FTS sanitize follows existing lexicon adapter patterns.

No ranking orchestration in this slice.

---

## Architecture diagram

```
scholomance_dict.sqlite
├── entry / entry_fts / rhyme_index / wordnet_*   ← Oracle authority (unchanged)
└── lexical_entry (+ embedding_* metadata)
    ├── lexical_relation                         ← sole edge authority
    ├── literary_device                          ← craft detail, no edge JSON
    └── lexical_entry_fts + lexical_entry_fts_map

codex/server/adapters/lexicalGraph.sqlite.adapter.js  ← read API for later Analyze
scripts/lexical-graph.mjs                             ← migrate|mirror|seed|embed
```

---

## Testing

- Migration creates overlay tables on fixture dict DB; `entry` row count unchanged; FKs/CHECKs enforced
- Mirror: two fixture `entry` rows with the same headword produce two ids `le:word:<id1>` and `le:word:<id2>` (no collision)
- `canonical_lower` matches the documented NFC/`en-US` algorithm
- Device seed upserts confuse-set via `commonly_confused_with` relations (not `contrasts_with`); `related_device` edges present where seeded
- `literary_device` table has no `related_devices_json` / `commonly_confused_with_json` columns
- Adapter hydration returns confused/related lists from relations
- Detection signals in seed validate against `DetectionSignal` shape (`kind`, `weight`, `parameters`); no claim that evaluators run in this slice
- FTS finds a device by name and by alias; delete removes FTS virtual row before graph entry; map cascades
- Array JSON CHECKs reject object/string masquerading as arrays
- Embedding all-or-nothing CHECK rejects partial tuples
- Mirror copies use `legacy_turboquant` + verified version or `unknown`; `getEmbedding` marks `comparable: false` when `unknown`
- Seeded devices have complete embedding tuples after embed; meta embedding stamps set
- Seed without example license fails transaction
- Commands use caller `--timestamp`; re-running migrate/mirror/seed is idempotent
- Existing `lexicon.sqlite.adapter` tests continue to pass unchanged
- `searchFts` pagination uses composite rank+rowid cursor; `listRelations` uses stable id cursor

---

## Verification gates

- `npm run test` covering new graph adapter + migration tests
- Ops dry-run on a copy of `scholomance_dict.sqlite` with meta version stamps
- Immunity scan on touched files before commit

---

## Follow-on slices (ordered)

1. **Lexical graph foundation** — this document  
2. **Word relation bridge** — project Oracle/WordNet synonyms and antonyms into `lexical_relation`  
3. **Phrase, idiom, motif, symbol, and allusion ingestion** — populate non-word nodes so Analyze has real material  
4. **Analyze retrieval orchestration** — ranking + domain result groups over this graph  
5. **Analyze IDE interface** — replace/repurpose Analyze panel; submit-only search; actions  
6. **Semantic-calculus trajectory matching** — concept path queries  
7. **Nexus expanded results** — search-first deep page  
8. **Oracle cutover** — promote `lexical_entry` to word authority when ready  

Without slices 2–3, the retrieval UI would arrive before the graph contains the material that makes Analyze feel like the intended engine.

---

## Acceptance criteria (this slice)

1. Overlay schema exists in `scholomance_dict.sqlite` without breaking Oracle lookup.  
2. Words mirror 1:1 from `entry` with ids `le:word:<entry_id>` (same headword may yield multiple nodes).  
3. Literary devices are seeded with schema-valid, machine-addressable detection signals, purposes, licensed examples, and relation edges.  
4. `lexical_relation` is the only persisted edge store; adapter hydrates device relation lists.  
5. Graph FTS5 returns device and word hits; FTS virtual row deleted before graph entry; map FK cascades.  
6. Embeddings obey all-or-nothing integrity; device embeds are complete tuples; mirrored legacy blobs use truthful metadata (`unknown` ⇒ retrievable, not comparable).  
7. Graph adapter exposes documented read methods; `searchFts` uses composite rank+rowid cursors; no Analyze UI ships yet.  
8. SCHEMA_CONTRACT updated with corrected shapes (identity, relations, DetectionSignal, embedding metadata).  
9. Migrations/seeds run in single transactions with caller-provided timestamps and rollback on failure.  
10. JSON array columns enforce `json_type = 'array'` (and object columns `json_type = 'object'` where specified).

---

## Architectural verdict

The dual-layer overlay remains the correct low-risk approach: preserves Oracle, avoids a second dictionary, creates shared substrate for Analyze/TrueSight/Nexus/Semantic Calculus, supports gradual migration, and gives literary devices first-class identities.

Primary risk addressed by this revision: **semantic integrity inside the graph contract** — stable identities, authoritative relations, machine-addressable detection signals, and versioned embeddings with all-or-nothing integrity.
