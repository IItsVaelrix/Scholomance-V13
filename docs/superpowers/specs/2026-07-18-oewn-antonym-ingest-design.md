# OEWN Antonym Ingest (Additive) — Design

**Date:** 2026-07-18  
**Branch:** `feat/lexical-graph-foundation` (or follow-on)  
**Depends on:** existing `scholomance_dict.sqlite` WordNet tables (`wordnet_synset`, `wordnet_lemma`, `wordnet_rel`)  
**Unblocks:** Analyze Oppositions group; sense-aware Analyze grouping (follow-on)

## Goal

Ingest Open English WordNet (OEWN) **antonym** relations into the existing dictionary DB so `lexiconAdapter.lookupAntonyms` and Analyze **Oppositions** return real, evidence-backed rows — without a full dictionary rebuild.

## Problem

The current OEWN ingest in `scripts/build_scholomance_dict.py` only records **`SynsetRelation`** edges under `<Synset>`. In OEWN LMF, antonyms are primarily **`SenseRelation`** edges under `<Sense>`:

```xml
<Sense id="…" synset="oewn-…">
  <SenseRelation relType="antonym" target="…"/>
</Sense>
```

Measured on the live DB (2026-07-18): `wordnet_rel` has hypernym/similar/etc., but **`rel='antonym'` count = 0**. Analyze therefore honest-empties Oppositions.

## Non-goals

- Full CMU/OEWN/Kaikki dictionary rebuild
- Sense-aware Analyze UI / multi-badge dedupe / panel chrome renames (separate follow-on)
- New sense-relation table (deferred; this slice projects to synset pairs)
- Fabricating antonyms from free-dictionary / Datamuse APIs (reciprocal closure of OEWN-asserted antonyms is **not** fabrication — see below)

## Approach (approved)

**Synset-projected additive ingest into existing `wordnet_rel`, scoped to `source='oewn'`.**

1. Download / open the **pinned OEWN release** that matches the DB (default: 2024).
2. Parse and validate **outside** any write transaction.
3. Project SenseRelation (+ any SynsetRelation) antonyms to synset pairs; apply **reciprocal closure**; dedupe.
4. Abort on release mismatch or unresolved coverage above threshold.
5. `BEGIN IMMEDIATE` → delete **only** OEWN antonyms → insert set → write meta → `COMMIT`.
6. Patch full builder so future rebuilds use the same shared projection rules.

## Architecture

```
OEWN XML (.xml.gz) ──► parse+validate (no DB write lock)
        │                 - lexicon/version metadata
        │                 - sense→synset map
        │                 - SenseRelation + SynsetRelation antonyms
        │                 - reciprocal closure + dedupe
        │                 - synset existence + resolution ratio
        ▼
BEGIN IMMEDIATE
  DELETE wordnet_rel WHERE rel='antonym' AND source='oewn'
  INSERT projected reciprocal antonym set (source='oewn')
  UPDATE meta stamps
COMMIT
        │
        ▼
lexicon.sqlite.adapter.lookupAntonyms
        │
        ▼
lexicalAnalyze.service → Oppositions group
```

Shared projection helpers live in a module both the additive CLI and `build_scholomance_dict.py` can import (or a small shared Python module under `scripts/` / `dict_data` tooling) so builder and CLI produce **identical** antonym sets from the same fixture.

## CLI contract

```bash
python scripts/ingest_oewn_antonyms.py \
  --db scholomance_dict.sqlite \
  --oewn_path dict_data/english-wordnet-2024.xml.gz \
  --expected-release 2024 \
  --timestamp 2026-07-18T09:00:00Z
```

| Flag | Required | Behavior |
|------|----------|----------|
| `--db` | yes (default path ok) | Target SQLite path |
| `--oewn_path` | yes | Local OEWN LMF XML or `.xml.gz` |
| `--expected-release` | **yes** | Exact OEWN release string expected in lexicon metadata (e.g. `2024`). Mismatch → abort before writes |
| `--timestamp` | **yes** (write mode) | ISO-8601 UTC stamp for `oewn_antonym_ingested_at`. **No `Date.now()` / `time.time()` for stamped fields.** Missing → reject write mode |
| `--download` | no | If path missing, fetch the **pinned URL for `--expected-release`** into `dict_data/` |
| `--max-unresolved-ratio` | no | Default strict threshold (e.g. `0.02`). Abort if unresolved/asserted exceeds this |

Pinned download URL for release `2024`:  
`https://en-word.net/static/english-wordnet-2024.xml.gz`

`dict_data/*` remains gitignored (except README / `.gitkeep`).

### Source scoping (do not erase other antonyms)

```sql
DELETE FROM wordnet_rel
WHERE rel = 'antonym'
  AND source = 'oewn';
```

Never `DELETE … WHERE rel = 'antonym'` alone. Future manual / alternate-source antonyms (`source='manual'`, etc.) must survive re-ingestion.

### Reciprocal closure

Global WordNet documents antonym with `reverse: antonym`. For every resolved directed edge `A → B`, project:

- `synset(A) → synset(B)`
- `synset(B) → synset(A)`

Then deduplicate. This is symmetric closure required by the relation definition, not invention of new antonym pairs.

Verification must include:

- `lookupAntonyms("hot")` contains `"cold"`
- `lookupAntonyms("cold")` contains `"hot"`

### Version / coverage gates (before any write)

1. Stream-parse lexicon metadata; read OEWN release/version.
2. Confirm it equals `--expected-release`.
3. Compute SHA-256 of the source file; store for provenance.
4. For each **asserted** directed edge (SenseRelation and/or SynsetRelation antonym, pre-closure), attempt sense→synset resolution and confirm both synsets exist in `wordnet_synset`.
5. Keep metrics **separate** (do not fold reciprocal closure into the resolution formula):

| Metric | Definition |
|--------|------------|
| `asserted_count` | Directed antonym edges found in XML (pre-closure) |
| `resolved_asserted_count` | Asserted edges whose both ends resolve to existing synsets |
| `unresolved_asserted_count` | Asserted edges dropped (missing sense map and/or missing synset) |
| `projected_count_after_closure` | Unique directed synset pairs **after** reciprocal closure + dedupe (output statistic only) |

Formulas:

```
resolution_ratio =
  resolved_asserted_count / max(asserted_count, 1)

unresolved_ratio =
  unresolved_asserted_count / max(asserted_count, 1)
```

Gate on:

```
unresolved_ratio <= max_unresolved_ratio
```

`projected_count_after_closure` may exceed `asserted_count` because one asserted edge can become two directed rows after reciprocal closure. It is **not** used in the resolution/unresolved formulas.

6. Abort if release incompatible **or** `unresolved_ratio` exceeds `--max-unresolved-ratio`.

No silent projection of OEWN 2025 (or other) onto a 2024-tied synset set.

### Uniqueness contract (measured 2026-07-18)

Inspected live `scholomance_dict.sqlite` and `scripts/build_scholomance_dict.py`:

- `wordnet_rel` has **no UNIQUE / PRIMARY KEY** on `(synset_id, rel, target_synset_id)` or including `source`.
- Only index: non-unique `idx_wordnet_rel_synset(synset_id)`.

**This slice must not alter that uniqueness constraint** without auditing every `wordnet_rel` consumer.

Even without a DB UNIQUE, insert policy is application-enforced so future schema tightening (or duplicate lemma rows) cannot silently overwrite stronger provenance:

| Situation | Behavior |
|-----------|----------|
| Existing row `antonym` for same `(synset_id, target_synset_id)` with `source='oewn'` | Removed by scoped delete, then re-inserted from this run |
| Existing row `antonym` for same pair with **other** `source` (e.g. `manual`) | **Preserve** the non-OEWN row; **skip** the OEWN insert for that directed pair |
| No existing non-OEWN row for the pair | Insert OEWN row |

Never replace manual / stronger provenance merely to stamp `source='oewn'`. Skips are counted and reported separately (`oewn_antonym_skipped_existing_count`).

If a future schema adds `UNIQUE(synset_id, rel, target_synset_id)`, this same skip policy avoids insert conflicts. If uniqueness includes `source`, both rows may coexist; then `lookupAntonyms` (or the Analyze layer) must **deduplicate identical antonym lemmas** — adapter change only if that case is introduced; not required while the live schema has no UNIQUE.

### Meta stamps

| Key | Value |
|-----|--------|
| `oewn_antonym_release` | e.g. `2024` |
| `oewn_antonym_source_url` | pinned download URL or file URI |
| `oewn_antonym_source_sha256` | hex digest of source bytes |
| `oewn_antonym_asserted_count` | integer |
| `oewn_antonym_resolved_asserted_count` | integer |
| `oewn_antonym_unresolved_asserted_count` | integer |
| `oewn_antonym_resolution_ratio` | `resolved_asserted_count / max(asserted_count, 1)` |
| `oewn_antonym_unresolved_ratio` | `unresolved_asserted_count / max(asserted_count, 1)` |
| `oewn_antonym_projected_count` | `projected_count_after_closure` (post-reciprocal unique directed pairs prepared) |
| `oewn_antonym_inserted_count` | rows actually inserted this run |
| `oewn_antonym_skipped_existing_count` | OEWN pairs skipped because a non-OEWN antonym already exists for the pair |
| `oewn_antonym_ingested_at` | caller `--timestamp` only |

### Transaction order

1. Parse and validate source **outside** transaction (two streaming passes; reopen gzip/XML per pass).
2. Verify release + synset coverage + `unresolved_ratio` gate; abort → **no DB writes**.
3. `BEGIN IMMEDIATE`
4. `DELETE … rel='antonym' AND source='oewn'`
5. For each directed pair in the projected reciprocal set: if a non-OEWN `antonym` row already exists for `(synset_id, target_synset_id)`, skip and count; else insert
6. Write meta (including inserted vs skipped counts)
7. `COMMIT`

Parsing before `BEGIN` avoids holding a write lock across two full XML passes. The validated result set exists before any deletion.

### Implementation hardening (XML)

- Reopen the XML or gzip stream separately for each pass.
- Use streaming `iterparse`.
- `elem.clear()` processed elements to bound memory.
- Handle the LMF namespace explicitly (`{*}Sense`, `{*}SenseRelation`, etc.).
- Full builder: collect **both** existing `SynsetRelation` antonym **and** projected `SenseRelation` antonym.
- Deduplicate across asserted synset edges, projected sense edges, and reciprocal closure.

### Row shape

`(synset_id, 'antonym', target_synset_id, 'oewn', source_url)`

### Errors

| Condition | Behavior |
|-----------|----------|
| Missing `--timestamp` in write mode | Reject before parse/write |
| Missing OEWN path (no `--download`) | Non-zero exit |
| Release ≠ `--expected-release` | Abort before writes |
| Unresolved ratio above threshold | Abort before writes |
| Malformed XML | Abort before writes; DB unchanged |
| Missing / locked DB | Fail before writes |
| Mid-transaction failure | Rollback; OEWN antonym set unchanged from pre-BEGIN state |

## Files

| Path | Responsibility |
|------|----------------|
| `scripts/ingest_oewn_antonyms.py` | Additive CLI |
| `scripts/oewn_antonym_project.py` (or equivalent shared module) | Parse, project, reciprocal, dedupe, validate — shared by CLI + builder |
| `scripts/build_scholomance_dict.py` | Use shared module; SynsetRelation + SenseRelation antonyms |
| `dict_data/README.md` | Ops note: pinned 2024 URL, CLI flags, provenance |
| `package.json` | Optional `dict:ingest-antonyms` script |
| `tests/server/lexicon.antonyms.test.js` (+ Python/fixture tests as needed) | QA matrix below |
| `tests/fixtures/oewn-antonym-mini.xml` (or `.xml.gz`) | Tiny LMF fixture with sense antonyms + known synsets |

### Regression fixture (DB seed for survival test)

Preload three rows before re-ingest:

| rel | source | purpose |
|-----|--------|---------|
| `antonym` | `oewn` | Replaced by ingest |
| `antonym` | `manual` | **Must survive** |
| `similar` | `oewn` | **Must survive** (non-antonym) |

After ingestion: only the old OEWN antonym set is replaced; `manual` antonym and `oewn` similar remain.

## QA / test matrix

| # | Assertion |
|---|-----------|
| 1 | Reciprocal lookup: `hot`↔`cold` (fixture or live after ingest) |
| 2 | Non-OEWN antonyms (`source='manual'`) survive re-ingestion |
| 2b | When a manual antonym already covers the same synset pair, OEWN insert is **skipped** (not replaced); `skipped_existing_count` increments |
| 3 | Release mismatch fails **before** writes |
| 4 | Excessive `unresolved_ratio` fails **before** writes |
| 4b | `resolution_ratio` / `unresolved_ratio` use asserted metrics only (not `projected_count_after_closure`) |
| 5 | Malformed XML leaves the database unchanged |
| 6 | Missing `--timestamp` rejects write mode |
| 7 | Builder and additive CLI produce **identical** antonym sets from the same fixture |
| 8 | Repeated execution produces identical rows and counts |
| 9 | Existing non-antonym relation counts remain byte-for-byte stable (count + checksum of non-antonym `wordnet_rel` rows, or equivalent) |
| 10 | This slice does not add/alter a `wordnet_rel` UNIQUE constraint |

Live smoke (post-ingest on real DB): Analyze Oppositions for antonym-bearing lemmas is non-empty.

## Honesty / law notes

- Only OEWN-asserted antonym pairs enter the set; reciprocal edges are the declared reverse of that relation.
- Synset projection can slightly blur rare sense-specific antonymy; acceptable for Oppositions lighting-up. Sense-true storage may follow when Analyze moves to sense cards.
- Analyze honesty law unchanged: if a lemma has no antonym rows, Oppositions still returns `{ items: [], emptyReason }`.
- Caller-provided `--timestamp` only — no internal wall-clock for stamped meta (matches lexical-graph CLI law).

## Follow-ons (out of scope)

- Sense-aware Analyze grouping (CLEAVE → SEPARATE / ADHERE cards)
- Deduplicated related lemmas with multiple relation badges
- Panel title / MEANINGS label / collapsible sections
- Optional `wordnet_sense_rel` table if projection proves too lossy

## Success criteria

- [ ] Additive CLI lands with scoped delete, reciprocal closure, release gates, caller timestamp
- [ ] Resolution metrics use asserted counts only; gate on `unresolved_ratio`
- [ ] Manual antonyms preserved; conflicting OEWN pairs skipped and counted
- [ ] No `wordnet_rel` UNIQUE constraint change in this slice
- [ ] Shared projection module used by CLI and full builder
- [ ] Live DB has non-zero OEWN `antonym` rows; manual antonyms (if any) untouched
- [ ] `lookupAntonyms` works bidirectionally for known pairs without adapter signature changes
- [ ] Full QA matrix green
- [ ] Analyze Oppositions lights up for antonym-bearing lemmas
