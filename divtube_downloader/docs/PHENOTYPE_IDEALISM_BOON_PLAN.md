# Phenotype Idealism — Top-5 Boon Implementation Plan (divtube_downloader harness)

Authored from measured evidence against the live tree. Each boon lists Goal,
Evidence (file:line), Preconditions, Tasks, Verification, Risk/Rollback, Effort.

> **Honesty corrections vs. first-pass analysis (measured, not assumed):**
> - **Boon 4:** the `NoActiveAppError` race at `app.py:284` is **already fixed**
>   in current source (UI-thread `app = self.app` capture + try/except). The
>   `crash-*.log` files are *stale artifacts* of the pre-fix bug, not a live race.
> - **Boon 5:** the binaries are **already `.gitignore`d and NOT git-tracked**
>   (`git ls-files` matches only `build.gradle`). This is local-disk hygiene, not
>   a `git filter-repo` history rewrite.
> - **Boon 1:** only the `phonology` gene domain exists in SCDNA, and
>   `scripts/phenotypic-ideal.mjs` lives at repo **root** (not under divtube).
>   The capability **packet** is the deliverable; divtube *genes* are a flagged
>   follow-up (cannot be honestly claimed yet).

---

## Boon 1 — Curate a `divtube-cockpit` SCDNA capability packet  🥇
**Classification:** architectural · Coherence 5 · Velocity 3 · Safety 5 · Reuse 5 · Future 5

### Goal
Make Phenotype Idealism return real archaeology (`capabilities:[…]`) for the
harness's own domain instead of `capabilities:[]`.

### Evidence
- `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/` holds exactly **one**
  packet: `phonology.capability.json` (surfaces cover only `codex/core/phonology/**`,
  `scripts/align_lyrics.py`, visualiser pages).
- `capability_store.py:load_packets` globs `*.capability.json`; `matches_surface`
  is a pure `fnmatch` of the hit path against `packet.surfaces`. Nothing matches
  `divtube_downloader/**` → my run returned `capabilities:[]`, `genes:[]`.
- `capability_compiler.py:compile_packet` **refuses** any capability whose `path`
  does not exist, and stamps an `scd64:` checksum (hand-edited packets are refused
  by `load_packets` on checksum mismatch).
- Verified-existing divtube surfaces: `tui/services/tool_service.py`,
  `tui/ui/app.py`, `turboquant_plugin.js`, `embeddings/`.
  (`scripts/phenotypic-ideal.mjs` is at repo root — do NOT list it as a divtube surface.)

### Preconditions
- Run from `steamdeck_brain/` with `PYTHONPATH=steamdeck_brain`.
- Every `capabilities[].path` must exist relative to REPO_ROOT
  (`capability_store.REPO_ROOT` = repo root, 3 parents up from the scdna dir).

### Tasks
1. Author a **draft** JSON `scdna/capabilities/divtube-cockpit.draft.json`:
   - `contract: "SCDNA-CAPABILITY-v1"`, `version: "1.0.0"`, `domain: "divtube-cockpit"`.
   - `surfaces`: `["divtube_downloader/tui/**", "divtube_downloader/turboquant_plugin.js", "divtube_downloader/embeddings/**"]`.
   - `capabilities[]` — each with `need` / `canonical` / `path` (+ `evidence`, `forbidden`), e.g.:
     - need: "semantic codebase search for Phenotypic Idealism hits" →
       canonical: TurboQuant float32-cosine (`codex/server/services/codebaseSearch.service.js`) →
       path: `divtube_downloader/turboquant_plugin.js` (the divtube scoring surface).
     - need: "tool dispatch surface (the agent's hands)" →
       canonical: `ToolService.execute_tool` → path: `divtube_downloader/tui/services/tool_service.py`.
     - need: "TUI app shell / threaded archive search" →
       canonical: `DivTubeApp` → path: `divtube_downloader/tui/ui/app.py`.
     - forbidden examples: "re-embedding via a second vectorizer ladder",
       "a second tool-dispatch god-class parallel to ToolService".
2. Dry-run compile: `python -m vaelrix_forcefield.scdna.capability_compiler --draft <draft>`.
   Fix any `REJECT` (non-existent path / missing field).
3. Commit: re-run with `--commit` → writes `divtube-cockpit.capability.json` with a
   valid `scd64:` checksum.

### Verification
- `python -m vaelrix_forcefield.scdna.phenotypic_evidence --query "tool dispatch" \
   --hits-json '[{"path":"divtube_downloader/tui/services/tool_service.py"}]'`
   → `capabilities` now contains `divtube-cockpit`; `packet_count_loaded` = 2.
- Re-run `phenotypic_ideal` (scope=divtube) → `Capabilities: 1`.

### Risk / Rollback
- Additive file; rollback = delete `divtube-cockpit.capability.json`.
- Checksum guarantees a hand-edit is detected & refused, so the store self-protects.

### Effort
S (≈1 hr). **Genes follow-up (flagged, not in scope):** author a divtube gene
packet via `codex/core/pixelbrain/scdna-gene-packet.js` so `select_genes` stops
returning `[]` for divtube queries — requires its own curation ritual.

---

## Boon 2 — Make `scope=divtube` actually bias retrieval  🥈
**Classification:** behavioral · Coherence 5 · Velocity 5 · Safety 4 · Reuse 4 · Future 4

### Goal
`scope=divtube` should prefer `divtube_downloader/**` hits instead of being
cosmetic (today it is only forwarded into packet metadata).

### Evidence
- `scripts/lib/phenotypic-ideal-compose.mjs`:
  - `scope` computed at L96 (`opts.scope === 'divtube' ? 'divtube' : 'repo'`).
  - `searchHits(query)` (L21) takes **only** `query`; calls `searchCodebase(query)`.
  - `scope` is passed only to `assemblePhenotypicIdealPacket` (L143) — never to search.
- `codex/server/services/codebaseSearch.service.js:188` `searchCodebase(query)`:
  loads `collabPersistence.codebase.getAll()`, cosines **all** chunks, slices top
  `SEARCH_LIMIT=10`. No path filter exists.
- Measured: `scope=divtube` run returned collab-server / OAuth docs, not divtube.

### Preconditions
- TurboQuant index populated (`node scripts/index_codebase_vectors.js`), else
  compose throws `EMPTY_INDEX` (already handled).

### Tasks
1. In `searchHits`, accept an optional `scope` arg.
2. After `searchCodebase(query)` returns, when `scope === 'divtube'`:
   - Partition hits into `inScope` (`path.startsWith('divtube_downloader/')`) and rest.
   - If `inScope.length` ≥ a floor (e.g. 3), return `inScope` (preserving score order);
     else return `inScope.concat(rest)` so we never drop below the original count.
   - This is a **re-rank/filter**, not a new index — additive & reversible.
3. Thread `scope` from `composePhenotypicIdeal` → `searchHits(query, scope)`.
4. (Optional) record `scopeApplied: true` + `inScopeCount` in packet metadata for audit.

### Verification
- New Vitest case in the phenotypic-ideal suite: inject mixed hits, assert
  `scope=divtube` surfaces divtube paths first; `scope=repo` leaves order untouched.
- Manual: `node scripts/phenotypic-ideal.mjs --query "tool dispatch" --scope divtube`
  → top hits under `divtube_downloader/`.

### Risk / Rollback
- Pure post-filter; rollback = revert the `searchHits` change. No schema/index change.
- Guard against empty-index starvation by the concat-fallback in step 2.

### Effort
S (≈1–2 hr).

---

## Boon 3 — Decompose the `ToolService` god-class  🥉
**Classification:** structural · Coherence 4 · Velocity 2 · Safety 3 · Reuse 5 · Future 5

### Goal
Thin `ToolService` router delegating to cohesive handler modules, matching the
direction already stated in `harness_tools.py` ("kept separate … so parsers/path
logic can be unit-tested without importing the full TUI tool surface").

### Evidence
- `tui/services/tool_service.py`: **2758 lines**, class `ToolService` (L333),
  **73 methods**, ~50 of which are thin `_toolname(self, kwargs, callback)` handlers
  dispatched from `execute_tool` (L1459): `_read_file` L1563, `_search_code` L1694,
  `_cleri_probe` L1954, `_phenotypic_ideal` L2189, `_raid_query` L2366,
  `_codebase_search` L2383, `_heal` L2701, `_apply_patch` L2742, … plus `_fmt_bridge` L1939.
- `.consolidation-backup` (115 KB) + `.healer.bak` (84 KB) show repeated
  consolidation/repair cycles — a smell of an over-centralised module.

### Preconditions
- Existing test coverage for `execute_tool` dispatch (add a golden dispatch test first).

### Tasks (strangler-fig, incremental — never big-bang)
1. **Freeze behaviour:** add a dispatch golden test mapping every registered
   `tool_name` → handler method, so refactor is provably behaviour-preserving.
2. **Group handlers into mixins/modules** by domain, e.g.:
   - `tools/fs_tools.py` (`_read_file`, `_replace_file_content`, `_file_create`, `_list_directory`, `_find_file`)
   - `tools/search_tools.py` (`_search_code`, `_codebase_search`, `_forensic_search`, `_archive_search`, `_archive_neighbors`)
   - `tools/diagnostic_tools.py` (`_diagnostic_*`, `_immunity_*`, `_cleri_probe`, `_health_*`)
   - `tools/law_tools.py` (`_law_get`, `_law_audit`, `_law_debug`, `_scd64_*`)
   - `tools/collab_tools.py` (`_bug_*`, `_task_*`, `_agent_list`, `_memory_*`)
   - `tools/exec_tools.py` (`_run_command`, `_bash_session`, `_python_exec`, `_exec_reset`, `_test_run`, `_typecheck`)
3. Make `ToolService` compose these (mixin inheritance or a handler-registry dict
   keyed by `tool_name`), keeping `execute_tool` as the single dispatch entry.
4. Move one group per PR; run the golden dispatch test + full suite each time.

### Verification
- Golden dispatch test green after every extraction (no tool lost/renamed).
- `wc -l tool_service.py` trends down; each new module < ~400 lines.
- `python_exec`/`tui_inspect` smoke: every MCP tool still resolves & runs.

### Risk / Rollback
- Highest-risk boon (touches the agent's hands). Mitigated by golden test +
  one-group-per-PR + `.bak` backups. Rollback = revert the last group PR.

### Effort
L (≈1–2 days, spread over ~6 incremental PRs).

---

## Boon 4 — Crash-spool dedup/rotation (+ retire stale artifacts)
**Classification:** structural/behavioral · Coherence 4 · Velocity 4 · Safety 5 · Reuse 4 · Future 4

### Goal
Stop unbounded duplicate crash artifacts; route repeats by signature into
RAID/immune memory. **Note:** the underlying `NoActiveAppError` race is already
fixed (`app.py` `_search_archive` captures `app = self.app` on the UI thread +
try/except) — this boon is hygiene + future-proofing, not a race fix.

### Evidence
- ~19 `crash-*.log` + a `crash logs/` dir in the working tree; byte-size histogram
  shows duplicates: **4× 1121 B**, **3× 4484 B** identical (same crash recurring).
- `*.log` is already `.gitignore`d → these are **local** artifacts, not committed.
- `tui/services/subtlety_crash_forward.py` already POSTs/spools crashes
  (`_build_event`, `_post_crash`, `_default_spool_dir`) but does **no dedup/rotation**.
- Current crash signature is historical: `textual._context.NoActiveAppError` from
  `app.py:284` (pre-fix). Current source guards this.

### Tasks
1. **Purge stale artifacts:** delete the historical `crash-*.log` + `crash logs/`
   (already-fixed bug); confirm none are git-tracked first (`git ls-files`).
2. **Signature dedup:** in `subtlety_crash_forward.py`, hash `(errorType, top
   non-frame stack line)` → if seen within a window, increment a counter on the
   existing spool entry instead of writing a new file.
3. **Rotation cap:** keep at most N (e.g. 20) spool files; drop oldest.
4. **Feed memory:** on a *new* signature, optionally `bug_create`/RAID-seed so the
   immune system learns it (bridge already exists via collab).
5. Add a `.gitignore` line for `subtlety-spool/` if not present.

### Verification
- Unit test: feeding the same crash text 5× produces 1 spool entry with `count=5`.
- After purge: `ls crash-*.log` empty; spool dir bounded.

### Risk / Rollback
- Low risk (forwarder is best-effort, already wrapped). Rollback = revert forwarder
  change; restore artifacts from git history if ever needed (they're not tracked, so
  keep a tarball before purging if cautious).

### Effort
S–M (≈2–3 hr).

---

## Boon 5 — Local binary-bloat hygiene (gradle ~268 MB, glove 7.7 MB)
**Classification:** architectural/hygiene · Coherence 3 · Velocity 4 · Safety 4 · Reuse 3 · Future 4

### Goal
Keep the working tree lean and the TurboQuant indexer fast. **Correction:** the
binaries are **already `.gitignore`d and NOT git-tracked** — so no history rewrite
is needed; this is on-demand provisioning + guardrails.

### Evidence
- `du -h`: `gradle.zip` 127 M, `gradle-8.5/` 141 M, `embeddings/glove50.f32` 7.7 M.
- `.gitignore` already lists `gradle-8.5/`, `gradle.zip`, `embeddings/`, `*.log`, `*.bak`.
- `git ls-files | grep -E "gradle|glove"` → only `build.gradle` (a legit source file).
  → **nothing to `git rm --cached` / filter-repo.**

### Tasks
1. **Confirm & lock ignore:** verify `git check-ignore gradle.zip gradle-8.5 embeddings/glove50.f32`
   all return ignored (guard against accidental re-add).
2. **On-demand provisioning:** add/extend `run.sh` (or a `bootstrap.sh`) to fetch
   gradle + the GloVe embedding only when absent, with checksum verification.
3. **Document** in README: these are large local-only artifacts, how to provision.
4. (Optional) Add a pre-commit guard that rejects adding >5 MB binaries to the index.

### Verification
- Fresh clone + `bootstrap.sh` reproduces a working tree without committing binaries.
- `git status` clean after provisioning (ignored files don't show).
- TurboQuant index build time measured before/after (leaner tree → faster walk).

### Risk / Rollback
- Very low (no git history change). Rollback = revert `run.sh`/README edits.

### Effort
S (≈1–2 hr).

---

## Sequencing recommendation
1. **Boon 1 + Boon 2 first** (both S, both directly fix why Phenotype Idealism
   under-performs on its own harness — `Capabilities: 0` → real archaeology, and
   `scope=divtube` → relevant hits). They compound.
2. **Boon 5, then Boon 4** (quick hygiene wins, low risk).
3. **Boon 3 last** (largest, highest-risk; only after the golden dispatch test exists).

## Cross-cutting gates (per ENGINEERING_RULEBOOK / production_polish)
- Every boon: typecheck + targeted Vitest + `tui_inspect`/`python_exec` smoke before commit.
- Boon 1 must go through `capability_compiler` (never hand-stamp a checksum).
- Boon 3 must be strangler-fig (one group per PR) with the golden dispatch test green.

---

## ✅ Execution Log (all 5 boons implemented & verified)

### Boon 1 — `divtube-cockpit` capability packet — DONE
- Authored an 8-capability draft; compiled via `capability_compiler --commit`
  (validates every `path` exists + stamps the checksum; refuses hand-edits).
- New file: `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/divtube-cockpit.capability.json`
  (`checksum scd64:dc4bf9a8…`). Registry now loads **2 packets, 0 errors**.
- Verified: harness paths (`tool_service.py`, `turbovec.js`, `scholomance-bridge.mjs`)
  match `divtube-cockpit`; `codex/.../oauth.py` correctly matches nothing.
- Test: `divtube_downloader/tests/test_divtube_cockpit_capability.py` (5 tests).

### Boon 2 — `scope=divtube` biases retrieval + evidence — DONE
- `codex/server/services/codebaseSearch.service.js`: `searchCodebase(query, options={})`
  gains backward-compatible `options.pathPrefix`; filters the index **before**
  scoring so divtube chunks compete for the top-10 (fixes "all 10 hits were collab docs").
- `scripts/lib/phenotypic-ideal-compose.mjs`: `searchHits(query, scope)` passes the
  prefix; hits are also filtered to the subtree **before** `attachEvidence`, so
  capabilities/genes are matched against in-scope neighbors, not noise.
- End-to-end: `scope=divtube` + mixed hits → divtube-only `search.hits`,
  `evidence.capabilities=['divtube-cockpit']`.
- Tests: 2 new cases in `tests/qa/features/phenotypic-ideal-compose.test.js`
  (+ fixture `phenotypic-hits-divtube.json`). 4/4 pass; `forensic-search` 4/4 pass.

### Boon 3 — ToolService strangler-fig cut 1 — DONE
- Extracted the cohesive module-level bridge cluster (`PROJECT_ROOT`, `BRIDGE_SCRIPT`,
  `_node_bin`, `_extract_bridge_json`, `_run_bridge`, `_safe_path` + node-PATH side
  effect) into new `divtube_downloader/tui/services/bridge_dispatch.py`.
- `tool_service.py` re-imports every name (verified **same objects**, no duplication);
  net **−70 lines** (2759 → 2689). `_fuzzy_find_target` + all ~50 handlers untouched.
- Golden test written FIRST (baseline green) then re-run green post-extraction.
- Tests: `test_tool_service_dispatch_golden.py` (4) + `test_bridge_dispatch.py` (5).
- Regression gate: **full divtube suite 245 passed / 0 failed**; live `tui.ui.app`
  import smoke OK.

### Boon 4 — crash-spool dedup + rotation — DONE
- `subtlety_crash_forward.py`: `_crash_signature` (content hash) + `_rotate_spool`;
  `_spool_crash` now collapses byte-identical crashes to one file with a `count`
  and bounds the spool to `DEFAULT_SPOOL_KEEP=50`.
- Tests: 5 new in `test_subtlety_crash_forward.py` (dedup, distinct-separate,
  rotation, end-to-end). 7/7 pass.

### Boon 5 — binary-bloat guardrails — DONE
- `git rm --cached` the two tracked stray artifacts (`bug` = 1920×1080 PNG, `.kate-swp`);
  working copies kept. Confirmed only `build.gradle` is tracked; gradle/glove already ignored.
- Extended `.gitignore` (editor swaps, `/bug`, stray screenshots, `*.consolidation-backup`).
- Durable guardrail: `test_no_tracked_bloat.py` (3 tests) fails if bloat patterns are
  re-tracked or any tracked file exceeds 5 MB; asserts `gradle-8.5/` stays ignored.

### Totals
- 7 files modified, 7 files added.
- Python: 245 (full suite) + new boon tests green. JS: 12 targeted tests green.
- No regression to the running TUI (import smoke + full suite).
