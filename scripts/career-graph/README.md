# Career Graph Build Pipeline (Tasks 4–6)

Reproducible Node tooling that imports **pinned** O*NET 30.3 + ESCO 1.2.1 +
O*NET–ESCO crosswalk releases into a canonical SQLite graph with FTS5, then
emits a pinned `core` shard, a pinned `universal` bridge shard, and one
`family-<SOC>` shard per SOC major group. Nothing here is fetched at runtime by
the browser product.

## Pipeline

```
fetch-sources.mjs   pinned URLs -> SHA-256 verify -> data/career-graph/raw/<version>/
ingest-sources.mjs  raw O*NET/ESCO/crosswalk -> normalized CSV interchange format
build-database.mjs  normalized CSV -> career_graph.sqlite (FTS5, sealed checksum)
build-shards.mjs    career_graph.sqlite -> core/universal/family shards + manifest.json
verify-shards.mjs   manifest.json -> integrity + checksum + residency + identity check
```

npm scripts:

| Script | Purpose |
|---|---|
| `npm run career:sources:fetch` | Download + verify pinned sources (refuses unpinned digests) |
| `npm run career:sources:record` | Download + **pin** the real SHA-256 into the config (trust-on-first-use) |
| `npm run career:sources:verify:offline` | Re-verify already-cached sources without network |
| `npm run career:graph:ingest` | Normalize raw sources into the interchange format |
| `npm run career:graph:build` | Build the canonical SQLite graph |
| `npm run career:graph:shards` | Emit core/universal/family shards + manifest |
| `npm run career:graph:verify` | Verify shards (integrity, checksum, residency, identity) |
| `npm run career:graph:all` | ingest → build → shards → verify |

## Honest checksum pinning (no fabricated provenance)

`config/career-graph-sources.json` ships with **all-zero placeholder digests**
(`checksumStatus: "placeholder-unverified"`). This is deliberate: the scaffold
does not assert a checksum it has not verified.

1. Confirm each `url` against the official source (see `notes` per source).
2. `npm run career:sources:record` — downloads each source, computes its real
   SHA-256, writes the file, and records the digest + `verified-pinned` back
   into the config.
3. Review the diff, then commit the pinned config.
4. From then on `npm run career:sources:fetch` verifies downloads against the
   pinned digest and fails loudly on any mismatch.

Verify mode **refuses** a placeholder digest with
`CAREER_SOURCE_CHECKSUM_NOT_PINNED:<id>` so an unpinned source can never be
silently accepted.

## Confirm the raw layout before pinning (Task 5 honesty note)

`ingest-sources.mjs` encodes the *expected* raw file names and column headers
in `RAW_LAYOUT`. These are release-specific. After fetching, open the real
files and confirm `RAW_LAYOUT` matches the O*NET 30.3 text release, the ESCO
1.2.1 CSV bundle, and the crosswalk; adjust the constants if the pinned release
differs. The normalization logic is unit-tested against synthetic files in this
documented layout (`tests/unit/careerGraphIngest.test.ts`).

Expected raw layout:

- `raw/<onet>/occupations.tsv` (TSV): `O*NET-SOC Code, Title, Description`
- `raw/<onet>/occupation_skills.tsv` (TSV): `O*NET-SOC Code, Skill ID, Skill Name, Importance, Level`
- `raw/<esco>/occupations.csv`: `conceptUri, preferredLabel, description`
- `raw/<esco>/skills.csv`: `conceptUri, preferredLabel, description`
- `raw/<esco>/occupation_skills.csv`: `occupationUri, skillUri, requirementType`
- `raw/<crosswalk>/crosswalk.csv`: `onetSocCode, escoOccupationUri`

## Normalized interchange format

Every normalized CSV (`*.normalized.csv`, and the `tests/fixtures/career-graph/mini-*.csv`
fixtures) shares one header:

```
record_type,namespace,external_id,kind,preferred_label,description,from_concept_id,predicate,to_concept_id,requirement_kind,importance,level,source_release,source_record_id
```

- `concept` rows use `namespace, external_id, kind, preferred_label, description`.
  Concept id = `namespace:external_id`.
- `relation` rows use fully-qualified `from_concept_id`/`to_concept_id`
  (`namespace:external_id`), `predicate`, `requirement_kind`, `importance`,
  `level`, `source_record_id`.

Law enforced by the build:
- `career_relation` is the sole edge store; crosswalks use `mapped_to`, never
  `same_as` (`same_as` is rejected).
- O*NET and ESCO identities stay namespaced and distinct.
- Orphan relations (referencing unknown concepts) are rejected (Gate B).
- Build + shard checksums are deterministic (sorted row content + schema +
  policy); no timestamps or randomness.

## Residency law (Gate C)

`manifest.json` declares `residency: { pinned: ["core","universal"], maxFamilyShards: 3 }`.
Shared concepts are duplicated into shards **without changing identity** (same
id + label). Runtime residency (≤3 family shards resident) is enforced by
`src/lib/career/graph/shard-cache.ts`.

## Tests

- `tests/unit/careerSourceManifest.test.ts` — manifest structure + checksum law + offline fetch
- `tests/unit/careerGraphBuild.test.ts` — canonical build, determinism, FTS5, orphan rejection
- `tests/unit/careerGraphIngest.test.ts` — raw → normalized → SQLite end-to-end
- `tests/unit/careerGraphShards.test.ts` — shard partition, identity, residency, verification
