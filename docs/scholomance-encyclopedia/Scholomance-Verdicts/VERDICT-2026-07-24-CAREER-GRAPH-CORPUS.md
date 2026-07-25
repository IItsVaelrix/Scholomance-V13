# VERDICT-2026-07-24-CAREER-GRAPH-CORPUS

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-VERDICT-CAREER-GRAPH-CORPUS`

## Verdict Identity
- Target: Career Graph corpus pipeline (`scripts/career-graph/*`) + browser data layer (`src/lib/career/graph/*`, `src/workers/career-graph.worker.ts`)
- Trigger: Operator review — "check our Resume tool now, been working on it all day"
- Bytecode: `PB-ERR-v1-VALUE-CRIT-SILENT-DROP` (skill rows dropped on column-name mismatch, build reports success)
- Auditor(s): `claude-opus-2026-07-24` (single auditor) with operator-directed scope (ranked follow-ups: browser wiring → tech skills → real ESCO/crosswalk)
- Date Rendered: 2026-07-24
- Re-Render Due: when a production `vite build` + in-browser `/career?careerGraph=live` click-through is confirmed, and when real ESCO 1.2.1 + real crosswalk replace the fixtures
- Audit Frame: Comb Initiative + Measure-Don't-Rationalize + Checks-That-Cannot-Fail (instance #7)
- Verdict Class: SINGLE-AUDITOR (DIAGNOSIS + RESOLUTION)
- Status: RENDERED — BUILT, TESTED, NOT COMMITTED

## 1. Scoring Sigil

| Metric | Score | Justification |
|---|---|---|
| **Impact Score** | 9 | The entire evidence-first Career UI exists to render skill classifications. The shipped graph had 1018 occupations and **5 relations** — the skill half was empty. Every user of the graph flow was looking at a corpus that did not exist. |
| **Revenue Potential** | 6 | The résumé tool is a candidate-facing product surface. A skill graph that actually resolves real O*NET occupations to real skills is the difference between a demo and a feature. |
| **Architecture Risk** | 5 | Medium. The core-shard repartition changes what every shard contains; the WASM worker adds a browser-only data path. Both are covered by tests, but the worker's prod-build packaging is unverified. |
| **UX Friction** | 7 | High pre-fix: the flag defaulted off, so most users never saw it — but any user who enabled the seed/graph flow got a 4-occupation demo with an honest "seed" label and no path to the real data. |
| **Law Violations** | 2 | Law 13 (Determinism) upheld throughout. The failure was a Law-of-Gates violation: five separate gates passed over a structurally-broken graph because none asked whether edges *exist*. |
| **Immune Potential** | 8 | High. This is the 7th confirmed instance of the checks-that-cannot-fail pathogen. The coverage-law gate (`verifyCoverage`) is a reusable antibody: structural, no magic number, trips on a whole-source silent drop. |
| **Innovation Rating** | 6 | The engine-agnostic `SqlSelect` port (one SQL body, better-sqlite3 in tests + SQLite-WASM in browser) and residency-by-shard-topology (no row-merging) are clean, reusable patterns. |

**Verdict Grade: A− (diagnosis + build quality), B+ (resolution outcome — complete but uncommitted and not browser-click-verified)**

## 2. Validated Praise

- **Operator's framing forced measurement.** "Been working on it all day" invited a congratulatory glance. Measuring the built artifact instead (`sqlite3 … count(*)`) surfaced the 5-relation corpus in the first minute. Every time this codebase's work is measured rather than described, the measurement disagrees with the description. This held again.
- **Honest seed provenance was already right.** Before the fix, the seed dataset carried `sourceRelease: 'seed-demo'`, a `SEED_GRAPH_DEMO` diagnostic, and a checksum derived from the file itself — no seed result could be mistaken for the real corpus. That discipline is why the empty graph was a *data* bug and not a *trust* bug.
- **Abort handling on `CareerPage` was clean** — fresh `AbortController` per run, `signal.aborted` checked before every `setState`, unmount abort. No stale-write path. Untouched by this verdict.
- **The residency machinery pre-existed and was correct** — `CareerShardCache` LRU + the worker-runtime cancellation core were already built and unit-tested; the fix wired the real WASM I/O into seams that were waiting for it.

## 3. Architectural Concerns

- **RESOLVED** — `scripts/career-graph/ingest-sources.mjs`: O*NET 30.3 ships skill ratings in **long format** (`Scale ID` ∈ {IM, LV} on separate rows), not the assumed `Skill ID/Skill Name/Importance/Level`. `pivotOnetSkillRatings` now folds IM/LV per (occupation, element); rows flagged `Recommend Suppress`/`Not Relevant` are dropped rather than asserted; an edge is emitted only when Importance is present.
- **RESOLVED** — `scripts/career-graph/prepare-sources.mjs`: substring matching selected `Essential Skills to Work Activities.txt` (a skill→activity crosswalk, no SOC column). Now: extension-bearing patterns are exact-basename matches, and a pattern that matches >1 file **fails the run** (`PREPARE_AMBIGUOUS`) instead of picking whichever the directory listed first.
- **RESOLVED** — `scripts/career-graph/build-shards.mjs`: the `core` shard carried *every* relation (7.5MB, a full copy of the canonical DB), which silently voided the residency law — "≤3 family shards resident" bounds nothing when the always-pinned shard already holds the whole graph. Core is now the occupation backbone + non-family edges only (950KB / 5 rels).
- **WARN** — ESCO and the crosswalk are still 4-row/1-row synthetic fixtures (`data/career-graph/raw/1.2.1/`, `2022-1/`). The graph is O*NET-real, ESCO-toy. Operator-ranked item 3, not yet done.
- **WARN** — `public/data/career-graph/shards/` is 27MB of gitignored build output. First-paint fetch is bounded to core+universal (~4.6MB) + one family, but the deploy pipeline must run `career:graph:publish` before `vite build` or the worker 404s in production.
- **INFO** — occupation scoring uses prefix-aware token overlap (deterministic, no stemmer) rather than bm25 as the 0..1 score. FTS5 bm25 is used only to rank the candidate pool. Documented in `sqlite-graph-port.ts`.

## 4. Law Violations

- **NONE for determinism** (Law 13). The port is pure given its readers; identical inputs produce identical, deterministically-ordered rows. The pipeline is reproducible end to end.
- **Law of Gates (implicit)** — the proximate failure. Integrity, checksum, residency, orphan, and identity-drift checks all passed over a 5-edge graph. Each asks whether the edges that exist are well-formed; none asked whether edges exist. The `verifyCoverage` gate closes exactly this hole.

## 5. Admonishment of the Arbiter

The Arbiter built five gates and a green test suite around a pipeline whose central output was empty, and shipped it. This is not a testing gap in the ordinary sense — 303 tests passed, and they were *good* tests of the parts they covered. The gap is philosophical: every gate verified **well-formedness** and none verified **presence**. A skill graph that is 99.5% occupations and 0.5% edges is structurally flawless and semantically dead, and nothing in the pipeline could tell the difference.

The tell was in the build log the whole time: `CAREER_GRAPH_BUILT … relations=5`. The number was printed, adjacent to `concept_count=1020`, and read past. `build_meta` even *stored* `relation_count|5`. The Arbiter had the evidence and did not look at it — the same failure mode this ledger has recorded six times before. A gate that cannot fail is not a gate; a number that is printed but never asserted-against is not a check.

Additionally: the in-flight fix already present in the working tree (`matchesPattern` excluding activities/context) was **inert** — `mapFiles` short-circuits on `existsSync(targetPath)`, and the bad file was already on disk, so the corrected matcher never ran. A fix that cannot execute against the state that triggered the bug is indistinguishable from no fix. It looked done in the diff and changed nothing in the graph.

## 6. Recursive Bug Elimination

- **Coverage-as-antibody**: `verifyCoverage` establishes the general form — for any many-to-many corpus, assert that each contributing source produces edges of the expected class, and that the connected fraction clears a floor set well below the real value. Reusable beyond careers.
- **Presence-print discipline**: any build script that prints a count should have a companion assertion. `normalizeOnet` now *throws* `INGEST_NO_SKILL_RELATIONS` when rows parse but yield zero edges — the print became a check.
- **Fix-executability**: a working-tree fix for a data bug must be validated against the on-disk state that produced the bug (here: `rm` the stale copy, re-run), not just against a clean-slate test.
- **Engine-agnostic port**: the `SqlSelect` seam lets the identical retrieval SQL be verified in Node (better-sqlite3) and shipped to the browser (WASM). Test-what-you-ship without a browser in the loop.

## 7. Remediation Tiers

### Immediate (This Session) — DONE
| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Exact/ambiguous file mapping + inert-fix removal | `claude` | RESOLVED | 1h | cheap | `career:sources:prepare` maps Essential/Transferable/Software, fails on ambiguity |
| IM/LV pivot + `INGEST_NO_SKILL_RELATIONS` throw | `claude` | RESOLVED | 2h | cheap | Ingest yields 63k skill edges; throws on a skill-less parse |
| `verifyCoverage` coverage-law gate | `claude` | RESOLVED | 1h | cheap | Rejects the 1018/5 graph; passes at 90.9% skilled coverage |
| Technology skills ingest (`Software Skills.txt`) | `claude` | RESOLVED | 1h | cheap | Tool concepts (`tech.*`) present; never graded `required` |
| Core-shard repartition | `claude` | RESOLVED | 1h | medium | Core = 950KB backbone; occupation→skill edges in family shards |
| SQLite-WASM browser data layer + `?careerGraph=live` | `claude` | RESOLVED | 4h | medium | Port drives full analysis over real shards (better-sqlite3 test green); WASM deserialize+FTS+bm25 confirmed against real engine |

### 30 Day (Next Sprint)
| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Production `vite build` + in-browser click-through of `/career?careerGraph=live` | operator | WARN | 1h | cheap | Worker chunk bundles, `sqlite3.wasm` serves in dist, occupation→skill renders in the live UI |
| Real ESCO 1.2.1 + real O*NET-ESCO crosswalk (replace fixtures) | `claude` | WARN | 4h | cheap | ESCO occupation/skill counts in the thousands; crosswalk `mapped_to` edges in the hundreds |
| Wire `career:graph:publish` into the deploy pre-build | operator | INFO | 30m | cheap | `deploy.sh` cannot ship a dist without the shards present |

### 90 Day
| Action | Owner | Severity | Cost | Reversibility | Success Criterion |
|---|---|---|---|---|---|
| Register `pathogen.presence-gate-absent` in adaptive immunity | `gemini-backend` | INFO | 2h | cheap | Fires when a build script prints a count that no test asserts against |
| Semantic reranker (Task 13) over the lawful frontier | `claude` | INFO | 6h | medium | Vectors reorder, never create, the frontier; determinism preserved |

## 8. Verdict Statement

This engagement was **a real fix, honestly bounded.** The central bug — a skill graph with no skills, greenlit by five gates and 303 tests — was diagnosed by measuring the artifact instead of trusting the work, root-caused to a three-link chain (wrong file → inert fix → wrong schema), and eliminated. The pipeline now produces 9808 concepts and 63114 skill edges at 90.9% occupation coverage, and a new coverage-law gate refuses to pass the class of graph that shipped. The operator's ranked follow-ups were taken in order: technology skills ingested, the core shard repartitioned so residency means something, and the SQLite-WASM browser data layer built and wired behind `?careerGraph=live`.

Calibrated honesty:
- Diagnosis quality: **A−** — the 5-relation graph was found in the first minute by measurement; the inert-fix trap and the long-format schema were both surfaced with evidence, not guessed.
- Build quality: **A−** — 332 career tests green (was 303), career module `tsc` clean, the retrieval port tested against the *real* shards, and the WASM deserialize→FTS5→bm25 chain confirmed against the actual engine.
- Resolution completeness: **B+** — everything the operator ranked is built, BUT: nothing is committed (working tree), no production `vite build` of the worker chunk was run, no literal browser click-through of the live page was possible (no browser automation this session), and ESCO/crosswalk remain fixtures. Each browser link was verified independently; the assembled page was not.

**This verdict explicitly declines to grade the resolution as complete.** The grade rises to A when a prod build ships the worker chunk, the live page renders occupation→skill in a real browser, and the ESCO/crosswalk fixtures are replaced with the pinned releases.

The win was measurement-led, as it always is here: the operator's day of work was real and the architecture was sound, but the one number that mattered — `relations=5` — was printed, ignored, and only mattered once someone read it.
