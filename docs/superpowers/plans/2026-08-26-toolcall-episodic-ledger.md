# Implementation Plan: Tool-Call Episodic Ledger

**Spec (binding authority):** `docs/scholomance-encyclopedia/PDR-archive/2026-08-26-toolcall-episodic-ledger-pdr.md`
(1820 lines — read the referenced line ranges per task, not the whole file, unless you need more context)

This plan is the PDR's argument, broken into dispatchable tasks. Where this
plan and the PDR conflict, the PDR wins; note the conflict in your report.

## Rulings already made (binding — do not re-litigate)

These were obtained directly from Angel (the repo's escalation owner, see
`VAELRIX_LAW.md` §12) before this plan was written. Do not stop to ask about
any of them.

- **ESCALATION-1 (jurisdiction gap, `divtube_downloader/`):** approved.
  Implement everything in this PDR yourself — SCD64/schema work that this
  repo's law nominally assigns to "Codex", the migration/encoder/tests
  nominally assigned to "Gemini", and the unassigned `divtube_downloader/`
  Python. Those are role labels for other tools the user runs separately, not
  live agents in this session.
- **ESCALATION-2 (Python direct DB access):** approved. `episode_store.py`
  opens `scholomance_collab.sqlite` directly via `sqlite3`, not through the
  Node bridge. Table creation stays exclusively in the JS migration list.
- **ESCALATION-3 (recall correctness mechanism, HIGH severity):** confirmed
  as designed in PDR §9.6 — refuse recall outright the instant a gitignored
  or symlinked path is detected under a directory target; require the
  ENTIRE working tree clean (not just the target file) before
  `microscope(refs=true)` can recall.
- **Session scope:** implement Phases 1-4 (schema, storage, classifier,
  staleness, recall wrapper wired in **shadow mode**). Phase 5 (flipping
  `DIVTUBE_EPISODE_LEDGER=on` in a live deployment) is explicitly NOT this
  session's call — the `on` code path is still implemented (PDR §9.8 already
  gives it, and shadow mode needs the same lookup machinery to compute
  would-have-hit), but the *decision* to run in `on` mode after a real
  shadow soak is deferred to Angel. Default stays `off` (F8) either way.
- **Baseline correction:** the PDR's Phase 5 milestone cites "449 tests" as
  the pytest baseline. That number is stale. The actual baseline in this
  worktree (branched from `feature/semantic-calculus-lexical-predicates` @
  `869a12e9`, NOT master — master is 459 commits behind and does not have
  the code this PDR references) is **522 pytest tests**
  (`cd divtube_downloader && .venv/bin/python -m pytest tests/ -q --collect-only`)
  and **38 vitest tests** in `tests/src/core/scd64`. Gate on these numbers,
  not the PDR's.
- **Shadow-mode reporting (PDR under-specifies this):** the PDR says shadow
  mode "computes what recall would have returned, comparing it to the
  freshly executed result" but gives no schema or file for storing that
  comparison — the episodes table has no would-have-hit/mismatch columns.
  Ruling: surface the comparison via the existing `callback` mechanism only
  (the same callback every handler already uses to print `✓ tool: detail`
  lines to the TUI) — no new file, table, or log format. This is suffient
  for a human running the cockpit in shadow mode to observe hits/mismatches
  as they work; a real Phase-4 report (§18 PIR) is out of this session's
  scope regardless, since it needs a week of real usage this session cannot
  produce. Do not invent additional persistence for it.
- **PIR:** do NOT create `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260826-TOOLCALL-EPISODIC-LEDGER.md`
  in this plan. It requires ≥500 real shadow evaluations that cannot exist
  yet. Filing it now with placeholder numbers would violate this project's
  "measure, don't rationalize" convention. Leave it for after the real
  shadow soak.
- **JS-vs-Python bytecode parity (PDR §11 Q7):** the PDR mentions "a
  JS-vs-Python golden test asserting byte-identical output." Ruling: not
  required. F1's acceptance criterion is a REGEX match
  (`/^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$/`), not exact
  equality with the JS encoder's output, and the bytecode is never used as a
  lookup key (args_hash/staleness_key are). Task 7 gives the exact Python
  bytecode function to write — format-compatible, not byte-identical.

## Global Constraints

- Every new/changed behavior must be additive and default to today's
  behavior when `DIVTUBE_EPISODE_LEDGER` is unset (PDR F7, F8). Nothing in
  this plan may change existing tool output when the flag is off.
- Determinism: canonical key-sorted JSON for hashing, SHA-256 throughout, no
  timestamps in any hashed value (PDR §3.2 Determinism row).
- Do not touch `.consolidation-backup` or `.healer.bak` files under
  `divtube_downloader/tui/services/` (PDR R6).
- Do not create a down-migration for v17 (PDR §14 Rollback item 3).
- Every SQL migration and JS/TS change must leave existing SCD64 hexes and
  existing bytecodes byte-identical (PDR R1, R2 — golden tests exist for
  this; do not weaken them to make a test pass).
- Node commands run from the repo root; Python commands run from
  `divtube_downloader/` using `divtube_downloader/.venv/bin/python`.
  Throttle test runs: `nice -n 19` prefix on both pytest and vitest/npx
  invocations (Steam Deck hardware constraint).
- Never `git add -A` — stage the specific files each task touches.

## Task dependency order

1 and 2 are independent of each other and of everything else — could run in
parallel across sessions, but this skill dispatches one implementer at a
time, so order: 1, 2, 3, 4, 5, 6, 7, 8. Task 7 depends on 1 (nav_hex.json),
4, 5, 6. Task 8 (final regression + DoD) depends on everything.

---

## Task 1: SCD64 NAV domain (schema, glossary, family resolution, export)

**Files:** `src/core/scd64/constants.ts`, `src/core/scd64/glossary.ts`,
`src/core/scd64/generateSCD64FromSlots.ts` (all MODIFIED); new
`scripts/scd64-nav-export.mjs`; `package.json` (add one npm script);
new `tests/src/core/scd64/nav-family.test.ts`; MODIFIED
`tests/src/core/scd64/art-family.test.ts` and
`tests/src/core/scd64/memory-family.test.ts` (R1 fix).

**Read first:**
- PDR §9.3 (`docs/scholomance-encyclopedia/PDR-archive/2026-08-26-toolcall-episodic-ledger-pdr.md:485-515`)
  — the exact `NAV_SLOT_ALIASES` block to append to `constants.ts`.
- PDR §9.4 (same file, lines 517-619) — `NAV_FAMILIES` (only 2 of 5 shown
  explicitly; you write all 5, see below) and the generation loop to append
  inside `buildSCD64Glossary()`, before `return Object.freeze(out);`.
- PDR §9.4b (same file, lines 621-638) — the `resolveFamily` registries-array
  fix in `generateSCD64FromSlots.ts`.
- PDR §12 (same file, lines 1259-1299) — the full `nav-family.test.ts` you
  create verbatim (it imports `nav_hex.json`, which this task must also
  produce — see below).
- PDR §13 R1 (same file, lines 1672-1691) — the exact fix for both
  glossary-count assertions.

**Grounded in the real files (verified in this worktree, not the PDR's
guesses):**
- `src/core/scd64/glossary.ts` already has a MEMORY loop at lines 449-496
  that is structurally identical to what PDR §9.4 wants for NAV — mirror it
  exactly (same `deriveHex`, same `isClaimKind`→`isNavIntent` rename, same
  `categoryChecksum` shape). Insert the NAV loop immediately after the
  MEMORY loop (i.e., right before `return Object.freeze(out);` at line 498).
- `_humanMeaningForSlot` (glossary.ts:255-260) falls back to
  `BUG_FAMILIES[familyName]?.description || 'See glossary.'` when no
  `SLOT_HUMAN_MEANINGS` entry exists for the family — MEMORY families
  already get this same generic fallback (they have no entries in
  `SLOT_HUMAN_MEANINGS` either), so leave `_humanMeaningForSlot` untouched;
  NAV families getting `'See glossary.'` is consistent with existing
  behavior, not a regression.
- `generateSCD64FromSlots.ts:1-14` — add `NAV_FAMILIES` to the import from
  `./glossary` and append it (NOT prepend) to the `registries` array, per
  PDR §9.4b. Confirm with `resolveFamily`'s existing test coverage that
  order doesn't change resolution of BUG/ART/MEMORY families.
- `SLOT_HUMAN_MEANINGS`, `SCD64_SLOT_NAMES`, `MEMORY_SLOT_ALIASES` are the
  real names in this codebase (constants.ts:1, :46) — match them exactly,
  do not invent new ones.

**Write all 5 NAV families**, not just the 2 the PDR spells out. The PDR
names them and their version bytes explicitly in §3.3: `NAV_ORIENT` (D1/71,
given in full in §9.4), `NAV_LOCATE_DEFINITION` (D2/72, given in full in
§9.4), `NAV_VERIFY_USAGE` (D3/73), `NAV_RUNTIME_PROOF` (D4/74),
`NAV_EDIT_VERIFY` (D5/75) — the PDR says these three "follow the identical
shape" to the two given. Derive their `canonicals` from the family's
`description` and from how `nav_classifier.py` (PDR §9.5, lines 655-702)
uses each family, so the canonical strings are meaningfully distinct, e.g.:
- `NAV_VERIFY_USAGE` — usage/reference-checking across the repo (this is
  what `microscope(refs=true)` and `atlas(action=refs|prefix)` produce).
  Its `INVARIANT` canonical must be `NAV_FRESHNESS:repo-clean-head` (not
  `git-subtree-clean` like NAV_ORIENT) — this is the family Task 7's
  wrapper routes to `staleness_kind=repo-clean-head`, so the SCD64
  canonical string should name the same invariant the code actually
  enforces, or the two would silently drift.
- `NAV_RUNTIME_PROOF` — running code to observe behavior (`evaluate`,
  `microscope(eval=true)`). Its `GATE` canonical must be
  `NAV_ADMISSION:never-recallable` (not `recallable`) — this family is
  explicitly excluded from caching (PDR F9), and the glossary entry should
  say so, not contradict the code.
- `NAV_EDIT_VERIFY` — checking a file this session itself just wrote. Its
  `COORDSYS` canonical is `NAV_SCOPE:single-file`, same staleness kind as
  `NAV_LOCATE_DEFINITION` (`file-sha256`).

Every family must fill all 8 slots in `SCD64_SLOT_NAMES` order (this is
exactly what `nav-family.test.ts`'s first test asserts) — copy the 8-slot
shape from `NAV_ORIENT`/`NAV_LOCATE_DEFINITION` for the other three, keep
version bytes `D3`/`73`, `D4`/`74`, `D5`/`75` respectively.

**`scripts/scd64-nav-export.mjs`** (new file) — model it on the existing
`scripts/scd64-glossary-export.mjs` (read it — it's ~80 lines, exports the
full glossary to `.atlas/scd64-glossary.json`). This new script is narrower:
it writes ONLY the NAV family→hex map, to
`divtube_downloader/tui/services/nav_hex.json`, in the exact shape
`nav-family.test.ts`'s currency check expects (PDR §12, the test named
`'nav_hex.json is current'`):
```js
const live = {};
for (const e of SCD64_GLOSSARY) {
  if (e.domain === 'NAV' && e.slotIndex === 0) live[e.family] = e.hexCode;
}
```
Write exactly that shape (2-space-indented JSON, trailing newline) to the
Python services directory. Add `"scd64:nav-export": "npx tsx scripts/scd64-nav-export.mjs"`
to `package.json`'s `scripts` block (alongside the existing `scd64:*`
entries) — match the invocation style of `scd64:intellisense`
(`package.json:120`). Then RUN the script and commit the resulting
`divtube_downloader/tui/services/nav_hex.json` — Task 7 needs this file to
exist; do not leave it as dead code that nobody has run.

**Verification:**
```bash
npx tsx scripts/scd64-nav-export.mjs   # must succeed and write the json file
nice -n 19 npx vitest run tests/src/core/scd64 --reporter=dot
```
Must be green, including the new `nav-family.test.ts` and both R1-updated
files. Confirm no existing SCD64 hex moved — the R2 golden-style check for
this domain is `nav-family.test.ts`'s "version bytes collide with no other
domain" test; if that fails, an existing hex moved and you must find why
before proceeding, not adjust the test.

**Report:** list the 5 family canonical strings you chose for the 3
families not given verbatim in the PDR, so the reviewer can check they
match how Task 7's classifier and staleness code actually use them.

---

## Task 2: `TOOLCALL` bytecode source kind

**Files:** `codex/core/diagnostic/BytecodeXPVaccine.js` (MODIFIED),
`tests/diagnostic/bytecodeXPVaccine.test.js` (MODIFIED).

**Read first:**
- PDR §9.2 (PDR file lines 424-483) — the exact three-constant edit
  (`BYTECODE_XP_SOURCE_KINDS`, `BYTECODE_SOURCE_SEGMENTS`,
  `BYTECODE_PATTERN`) and the full `encodeBytecodeXPVaccineFromToolCall`
  function to add.
- PDR §13 R2 (lines 1695-1706) — the golden regression test to add,
  asserting that adding `TOOLCALL` does not move HEALTH's bytecode.

**Grounded in the real file** (`codex/core/diagnostic/BytecodeXPVaccine.js`,
already read in full — 256 lines): the three constants you're editing are
at lines 6-18 exactly as the PDR shows them (real file currently has ERROR/
HEALTH/CCCB only — no drift from what the PDR assumed). `pickStableKeys` and
`stableClone` (lines 228-247) are the helpers `encodeBytecodeXPVaccineFromToolCall`
must use for `stableContext`, exactly as the three existing
`encodeBytecodeXPVaccineFrom*` functions do (see `encodeBytecodeXPVaccineFromHealth`,
lines 111-138, as the closest structural template — same options pattern,
same `pickStableKeys({...})` call). `safeSemanticSlug` (lines 204-210) is
what generates `semanticSlug` from the `title` array-join pattern; use it
exactly as the PDR's snippet does (`options.semanticSlug || safeSemanticSlug(title)`).

**Verification:**
```bash
nice -n 19 npx vitest run tests/diagnostic/bytecodeXPVaccine.test.js --reporter=dot
```
Must be green including the new TOOLCALL cases and the R2 golden test. Also
run `nice -n 19 npx vitest run tests/diagnostic tests/collab --reporter=dot`
to confirm no adjacent suite regressed.

---

## Task 3: Migration v17 + `collabPersistence.episodes` accessors

**Files:** `codex/server/collab/collab.persistence.js` (MODIFIED), new
`tests/collab/collab.episodes.test.js`.

**Read first:**
- PDR §9.1 (PDR file lines 385-422) — the exact migration v17 object
  (table + 4 indices) to append to `COLLAB_MIGRATIONS`.
- PDR §3.3 (lines 125-148) — the full column contract table for
  `collab_toolcall_episodes`, for reference when writing accessor SQL.

**Grounded in the real file** (`codex/server/collab/collab.persistence.js`,
6300+ lines, already inspected): `COLLAB_MIGRATIONS` currently ends with a
`version: 16` entry (confirm the exact line with
`grep -n "version: 16" codex/server/collab/collab.persistence.js` — append
your v17 object immediately after it, inside the same array). The
`collabPersistence` export object is assembled at line 1521-1619, with one
key per accessor group (`memories: { set, get, getAll, delete }` at
lines 1561-1566 is the closest structural precedent — same async
`db.execute` pattern with parameterized SQL, same JSON stringify/parse for
structured columns). `setMemory`/`getMemory`/`getAllMemories`/`deleteMemory`
(lines 967-1020) are the exact functions to model your episode accessors
on — same file section ("--- Memories ---" comment header), same style.

This PDR's Python side (`episode_store.py`, Task 6) does NOT go through
these JS accessors — it opens the sqlite file directly (ESCALATION-2,
approved). These accessors exist for JS-side testability and any future JS
consumer, per the PDR's file map ("+collabPersistence.episodes accessors").
Write a small, complete group under a new `// --- Toolcall Episodes ---`
section, following the memories precedent:
- `insertEpisode(row)` — INSERT into `collab_toolcall_episodes` with all
  columns from the §3.3 contract table; compute `repeat_index` the same way
  `episode_store.py`'s `record()` will (COUNT of prior rows with the same
  `args_hash`, inside a transaction) — this is the JS-side proof that the
  schema supports the same atomicity guarantee Python relies on.
- `lookupEpisode(argsHash, stalenessKind, stalenessKey)` — same WHERE
  clause shape as PDR §9.7's Python `lookup()` (most recent row matching
  all three, `result_text IS NOT NULL`, ORDER BY id DESC LIMIT 1).
- `getEpisodesForSession(sessionId)` — simple SELECT, for the idempotence/
  index-presence test.

Add this group to the `collabPersistence` export object as
`episodes: { insert: insertEpisode, lookup: lookupEpisode, getForSession: getEpisodesForSession }`,
next to `memories:`.

`collab.episodes.test.js` (new, model on an existing test in
`tests/collab/` for the `db.execute`-against-real-migrated-db pattern —
read `tests/collab/collab.persistence.test.js` first for that pattern)
must cover: migration v17 is idempotent (running the migration runner twice
does not error or duplicate the table/indices), insert then lookup round-
trips all columns, all 4 indices from PDR §3.3 exist
(`PRAGMA index_list('collab_toolcall_episodes')`), and — critically —
`tests/collab/collab.persistence.test.js`'s existing `currentVersion`
assertion (R3) reflects 17, not 16, after your migration.

**Verification:**
```bash
nice -n 19 npx vitest run tests/collab --reporter=dot
```
Must be green, including `collab.episodes.test.js` and the untouched
`collab.persistence.test.js` (R3).

---

## Task 4: `episode_staleness.py`

**Files:** new `divtube_downloader/tui/services/episode_staleness.py`, new
`divtube_downloader/tests/test_episode_staleness.py`.

No dependency on Tasks 1-3 — pure `hashlib`/`os`/`subprocess`, no imports
from any other new module in this PDR.

**Read first:**
- PDR §9.6 (PDR file lines 705-896) — the COMPLETE module, verbatim. Write
  it exactly as given: `KIND_FILE`/`KIND_SUBTREE`/`KIND_REPO_CLEAN`/`KIND_NONE`,
  `is_recallable`, `_sha256_file`, `_read_head_sha`,
  `_subtree_dirty_and_ignored`, `_has_symlink`, `_git_subtree_key`,
  `_repo_clean_key`, `staleness_for`. This is the module ESCALATION-3's
  ruling confirmed — do not weaken the ignored-path or symlink refusal
  logic in `_git_subtree_key`, and do not change `_repo_clean_key`'s
  "anything outstanding anywhere voids repo-clean" behavior.
- PDR §12 (PDR file lines 1536-1670) — the COMPLETE test file, verbatim:
  `TestIgnoredSubtreeRefusesRecall` (the centerpiece regression test — it
  must FAIL against a version of `staleness_for` that doesn't use
  `--ignored=matching`, and PASS against the PDR's version — do not write a
  weaker test that passes against both), `TestSymlinkRefusesRecall`,
  `TestReadHeadSha`, `TestRepoCleanGate`.

**Grounded in the real repo:** this module has no dependency on repo
internals beyond standard `git`/`.git/HEAD` layout, which the tests
construct themselves via `git init` in a tempdir — nothing here needs
grounding against `tool_service.py` or any other file. Run
`git --version` to confirm git is on PATH in this worktree (it must be,
since the worktree itself is a git checkout) before writing subprocess
calls that assume it.

**Verification:**
```bash
cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/test_episode_staleness.py -v
```
Every test must pass, INCLUDING `test_key_is_none_before_and_after_the_ignored_mutation`
— if this one fails, the whole point of ESCALATION-3 is unmet; do not mark
the task done with this test skipped, xfailed, or weakened.

---

## Task 5: `nav_classifier.py`

**Files:** new `divtube_downloader/tui/services/nav_classifier.py`, new
`divtube_downloader/tests/test_nav_classifier.py`.

No dependency on any other new module — pure function of
`(tool_name, args, recently_written)`.

**Read first:**
- PDR §9.5 (PDR file lines 640-703) — the COMPLETE module, verbatim:
  `NAV_ORIENT`/`NAV_LOCATE_DEFINITION`/`NAV_VERIFY_USAGE`/`NAV_RUNTIME_PROOF`/
  `NAV_EDIT_VERIFY` constants (these five string literals must exactly
  match the five family names Task 1 wrote into `NAV_FAMILIES` in
  `src/core/scd64/glossary.ts` — that's what makes `NAV_HEX[why]` resolve
  in Task 7) and `classify_nav`.
- PDR §12 (PDR file lines 1479-1534) — the COMPLETE test file, verbatim:
  every branch (`evaluate` always RUNTIME_PROOF even after an edit,
  `microscope(eval=true)` also RUNTIME_PROOF, `refs` → VERIFY_USAGE,
  `symbol` or `line is not None` → LOCATE_DEFINITION, bare microscope →
  ORIENT, a path in `recently_written` → EDIT_VERIFY, `atlas` action
  splits usage/orientation, purity — including the `line: 0` falsy-trap
  test and the "args not mutated" purity test).

**Verification:**
```bash
cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/test_nav_classifier.py -v
```
All pass, including `test_line_zero_still_locates` (a naive `if args.get("line"):`
truthiness check would misclassify `line=0` — confirm the PDR's `is not None`
check is what you wrote, not a truthiness shortcut).

---

## Task 6: `episode_store.py`

**Files:** new `divtube_downloader/tui/services/episode_store.py`, new
`divtube_downloader/tests/test_episode_store.py`.

No import-time dependency on Tasks 1-3 or 4-5 — this module only needs
`sqlite3`/`hashlib`/`json`/`threading`/`uuid`/`os`. Its tests build their
own throwaway schema mirror (`_make_db`), so they don't need migration v17
to have actually run anywhere.

**Read first:**
- PDR §9.7 (PDR file lines 898-1113) — the COMPLETE module, verbatim:
  `MAX_RESULT_BYTES`/`SOFT_PRUNE_ROWS`/`HARD_PRUNE_ROWS`/`_PRUNE_ODDS`,
  `MODE_OFF`/`MODE_SHADOW`/`MODE_ON`, `current_mode`, `args_hash_for`,
  `_truncate_utf8`, and the full `EpisodeStore` class (`__init__` with the
  Turso split-brain guard from ESCALATION-2's ruling, `_conn`, `lookup` with
  the digest-verification integrity gate, `record` with `BEGIN IMMEDIATE`
  atomic repeat_index allocation, `_prune` two-tier).
- PDR §12 (PDR file lines 1301-1477) — the COMPLETE test file, verbatim:
  `TestArgsHash`, `TestDegradation` (including the Turso-configured test —
  this is the direct regression test for ESCALATION-2's split-brain
  concern), `TestRecordAndLookup` (including corrupted-row and
  multibyte-truncation tests), `TestRepeatIndexConcurrency` (the 4-thread
  test asserting `{0,1,2,3}` exactly, not just 4 rows — this is what
  `BEGIN IMMEDIATE` is FOR; if this test is flaky, the transaction
  boundary is wrong, don't retry-loop it into passing).

**Grounded in the real repo:** `COLLAB_DB_PATH` env var is the existing JS
convention (`codex/server/collab/collab.persistence.js:20-22`:
`process.env.COLLAB_DB_PATH ? path.resolve(...) : path.join(ROOT, 'scholomance_collab.sqlite')`)
— `EpisodeStore` doesn't read this env var itself (its constructor takes
`db_path` as a plain argument per the PDR), but Task 7's wiring must resolve
`db_path` the same way JS does, so Python and Node point at the same file.
Do not duplicate that resolution logic inside `episode_store.py` — leave it
to the caller, exactly as the PDR's `EpisodeStore.__init__(self, db_path, ...)`
signature implies.

**Verification:**
```bash
cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/test_episode_store.py -v
```
All pass. Run `TestRepeatIndexConcurrency` at least 3 times in a row
(`-k TestRepeatIndexConcurrency --count=3` if pytest-repeat is available,
otherwise loop the command 3 times in bash) to catch a flaky transaction
boundary before it reaches review — a race that fails 1-in-5 is still a
real race.

---

## Task 7: Wire the recall wrapper into `tool_service.py`

**Files:** `divtube_downloader/tui/services/tool_service.py` (MODIFIED),
new `divtube_downloader/tests/test_episode_recall.py`.

**Depends on:** Task 1 (`nav_hex.json` must exist), Task 4
(`episode_staleness`), Task 5 (`nav_classifier`), Task 6 (`episode_store`).
Carry forward: the five NAV family name strings from Task 5 (must equal
Task 1's `NAV_FAMILIES` keys), and the exact `EpisodeStore`/`staleness_for`
signatures from Tasks 4/6 (read the actual files Tasks 4-6 committed, not
just the PDR text — a fix-round may have adjusted a signature).

**Read first:**
- PDR §9.8 (PDR file lines 1115-1174) — the wrapper shape:
  `_episode_recall` and the pattern for `_microscope`
  (`hit, record = self._episode_recall(...); if hit is not None: return hit;
  result = self._microscope_uncached(kwargs, callback); record(result); return result`).
  **This snippet only fully implements `MODE_ON`'s serve-a-hit branch.** You
  must ALSO implement `MODE_SHADOW` per the ruling above: in shadow mode,
  still call `episode_staleness.staleness_for` and `self._episodes.lookup`,
  but NEVER return the stored text — always execute the real lens, then
  compare the fresh result to the shadow lookup (if any) and report the
  comparison through `callback` only (no new persistence):
  - no stored episode found (miss): no extra callback line — this is the
    common case during early shadow soak and would be noise.
  - stored episode found and `str(fresh_result) == hit["result_text"]`: one
    quiet callback line, e.g.
    `f"  [#7CFF8B]○[/] {tool_name}: would have recalled (match)"`.
  - stored episode found and mismatch: a loud callback line, e.g.
    `f"  [#FF5C7A]⚠[/] {tool_name}: would-have-hit MISMATCH — staleness key was unsound"`
    — this is the signal ESCALATION-3's shadow gate exists to catch; do not
    swallow it silently.
  Both modes call `record(result)` after the fresh result is computed (F1:
  "with the flag in shadow or on, exactly one row exists").

**Grounded in the real file** (all read directly in this session, not
guessed from the PDR):
- The five handlers to wrap are at these EXACT current locations:
  `_read_file` (`tool_service.py:1750`), `_telescope` (`:2895`),
  `_microscope` (`:2918`), `_atlas` (`:2969`), `_evaluate` (`:3008`). Rename
  each existing method to `<name>_uncached` (e.g. `_microscope` →
  `_microscope_uncached`) and add a new `<name>` wrapper method in its
  place, exactly as PDR §9.8 shows for `_microscope`. `_evaluate` is the one
  exception (PDR §3.1 F9, §9.6 module docstring): it calls
  `self._episode_recall` only to get a `record` function via the `noop`
  path's shape, but because `is_recallable("evaluate", ...)` is always
  False, `staleness_for` will already return `(KIND_NONE, None)` for it —
  confirm this happens naturally rather than special-casing `_evaluate`;
  the existing `is_recallable` gate in `episode_staleness.py` (Task 4) is
  what makes `evaluate` un-cacheable, not a branch in the wrapper.
  `_microscope`'s `eval=true` path goes through the SAME `_microscope`
  wrapper as everything else — `is_recallable` inside `staleness_for`
  already special-cases `tool_name == "microscope" and args.get("eval")`,
  so no separate wrapper logic is needed there either.
- `execute_tool`'s dispatch table (`tool_service.py:1630` onward) calls
  `self._microscope(kwargs, callback)` etc. by name — since you're keeping
  the same public method names and just renaming the old bodies, this
  dispatch table needs NO changes.
- `PROJECT_ROOT` is already imported at module scope
  (`tool_service.py:14`, from `bridge_dispatch.py:22` — repo root, verified
  four `dirname()` calls above `tui/services/`). Reuse it directly; do not
  redefine it.
- `_UNDO_STACK` (module-level list, `tool_service.py:139`) is what backs
  "recently written" — each entry has a `"path"` key set to the RAW
  (repo-relative) path passed to `_replace_file_content`
  (`tool_service.py:1859`, `_push_undo(raw_path, content)` — not the
  resolved absolute path). Add a small helper:
  ```python
  def _recently_written():
      return frozenset(e["path"] for e in _UNDO_STACK if e.get("path"))
  ```
  at module level (near `_push_undo`), and call it as
  `_recently_written()` (not `self._recently_written()` — it's a
  module-level function, matching `_push_undo`'s own scoping) from inside
  `_episode_recall`.
- No `self.agent_id` exists on `ToolService` today — `agent_id` for
  `EpisodeStore.record(agent_id=...)` should default to `""` (matches the
  schema's `agent_id TEXT NOT NULL DEFAULT ''`); do not invent a new
  constructor parameter or config surface to populate it. This is a known,
  acceptable gap — the PDR's canary rollout plan (§14, "enable `on` for the
  `mother` tab only") is Phase-5-and-later and out of this session's scope.

**New module-level pieces needed in `tool_service.py`** (add near the top,
after the existing imports, before the `ToolService` class):

```python
import hashlib
_NAV_HEX_PATH = os.path.join(os.path.dirname(__file__), "nav_hex.json")
try:
    with open(_NAV_HEX_PATH, "r", encoding="utf-8") as _f:
        NAV_HEX = json.load(_f)
except (OSError, json.JSONDecodeError, ValueError):
    NAV_HEX = {}


def _toolcall_bytecode(tool_name, target_path, args_hash, why_family, staleness_kind, staleness_key):
    """A PB-XP-v1-TCL-... identity string, format-compatible with (not
    byte-identical to) BytecodeXPVaccine.js's TOOLCALL kind — see PDR §11 Q7
    and this plan's ruling on JS/Python bytecode parity."""
    title = f"toolcall {tool_name} {why_family} {target_path or ''}"
    slug_src = "".join(ch for ch in title.upper() if ch.isalnum())
    slug = slug_src[:8] if len(slug_src) >= 4 else hashlib.sha256(title.encode("utf-8")).hexdigest()[:8].upper()
    stable = json.dumps(
        {"argsHash": args_hash, "stalenessKey": staleness_key, "stalenessKind": staleness_kind,
         "targetPath": target_path, "toolName": tool_name, "whyFamily": why_family},
        sort_keys=True, separators=(",", ":"),
    )
    fingerprint = hashlib.sha256(stable.encode("utf-8")).hexdigest()[:12]
    checksum = hashlib.sha256((stable + fingerprint).encode("utf-8")).hexdigest()[:12]
    return f"PB-XP-v1-TCL-{slug}-{fingerprint}-{checksum}"
```

Verify this satisfies F1's regex
(`^PB-XP-v1-TCL-[A-Z0-9]{4,8}-[0-9a-f]{12}-[0-9a-f]{12}$`) with a unit test
in `test_episode_recall.py` — pick 2-3 varied inputs (short/long tool
names, `target_path=None`) and assert `re.match(...)` on each.

**`ToolService.__init__`** (`tool_service.py:268`): after
`self._persistence = self._init_persistence()`, add:
```python
from tui.services import episode_store
_db_path = os.environ.get("COLLAB_DB_PATH") or os.path.join(PROJECT_ROOT, "scholomance_collab.sqlite")
self._episodes = episode_store.EpisodeStore(_db_path)
```
(matches the JS `COLLAB_DB_PATH` env var resolution from
`collab.persistence.js:20-22`, so Python and Node open the same file when
`COLLAB_DB_PATH` is set for either).

**Verification:**
```bash
cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/test_episode_recall.py tests/test_code_eval.py tests/test_lens_ux_fixes.py -v
```
`test_episode_recall.py` must cover, at minimum, PDR F1/F4/F5/F6/F7/F8/F9/F10/F11
as pytest cases (the PDR gives the acceptance criteria in §3.1, not full
test code for this file — write tests directly against them), PLUS the two
shadow-mode behaviors from this task's ruling above (shadow never returns a
stored result even on a proven hit; shadow still writes exactly one episode
row per call, matching F1). Then run the FULL regression suite:
```bash
cd divtube_downloader && nice -n 19 .venv/bin/python -m pytest tests/ -q
```
Must show **≥ 522 passed** (this plan's corrected baseline, not the PDR's
449) with `DIVTUBE_EPISODE_LEDGER` unset — confirming R4 (five wrapped
handlers behave identically with the flag off). Then re-run the same full
suite three more times, once each with:
- `DIVTUBE_EPISODE_LEDGER=on` and the real `scholomance_collab.sqlite`
  present (after Task 3's migration has been applied to it — if it hasn't,
  start the collab MCP server once, or apply the migration another way, so
  this run is meaningful)
- `COLLAB_DB_PATH=/nonexistent/x.sqlite` (F7)
- `TURSO_COLLAB_DB_URL=anything` set alongside a real local DB file present
  (§2 item 9 / Q5 — ledger must stay disabled, not silently use the local
  file)

All four full-suite runs must be green at ≥522. Report all four pass counts
in your report, not just the first.

---

## Task 8: Final regression sweep + Definition-of-Done audit

**No new files.** This task verifies the whole branch against PDR §15
(Definition of Done) and produces the completion report — it does not fix
anything itself; any gap found here goes back through the fix loop on the
task that owns it.

**Read first:** PDR §15 (PDR file lines 1744-1767) — the full checklist.
Skip the two items this plan's rulings explicitly deferred: the Phase-4
shadow report line (needs a real week of usage) and the ESCALATION rulings
line (already recorded above, not re-obtained here).

**Run, and report the exact output of each:**
```bash
nice -n 19 npx vitest run tests/src/core/scd64 --reporter=dot
nice -n 19 npx vitest run tests/diagnostic tests/collab --reporter=dot
cd divtube_downloader
nice -n 19 .venv/bin/python -m pytest tests/ -q                              # DIVTUBE_EPISODE_LEDGER unset
DIVTUBE_EPISODE_LEDGER=on nice -n 19 .venv/bin/python -m pytest tests/ -q
COLLAB_DB_PATH=/nonexistent/x.sqlite nice -n 19 .venv/bin/python -m pytest tests/ -q
TURSO_COLLAB_DB_URL=libsql://example.turso.io nice -n 19 .venv/bin/python -m pytest tests/ -q
grep -n "_run_bridge" tui/services/episode_store.py            # must be empty
grep -nE "CREATE TABLE|ALTER TABLE" tui/services/episode_store.py  # must be empty
cd ..
git status --short divtube_downloader/tui/services/            # no .bak/.backup listed as modified (R6)
npx tsx scripts/scd64-nav-export.mjs && git status --short divtube_downloader/tui/services/nav_hex.json  # must show no diff — committed copy is current
npm run lint -- --max-warnings=0
```

Confirm each PDR §15 checkbox that applies to Phases 1-4 mechanically —
don't take a prior task's self-report on faith, re-run the specific command
that proves it (e.g. re-run `TestRepeatIndexConcurrency` yourself, don't
just read that Task 6 said it passed).

**Report:** a checklist mirroring PDR §15, each line marked done/N-A (with
N-A reasons matching this plan's stated deferrals) — this becomes the
completion evidence for the whole-branch review.
