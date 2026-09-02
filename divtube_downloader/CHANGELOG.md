# Changelog — DivTube_downloader

All notable changes to this app are recorded here.
Format follows [Keep a Changelog](https://keepachangelog.com/); this app follows
semantic versioning at **v1.0.0** (matching `version` in `build.gradle`).
The old `v1.0-SNAPSHOT` label was stale: P3C forbids SNAPSHOT on release
artifacts, and the build file had already moved to `1.0.0`.

## [Unreleased] — 2026-09-02

### Fixed
- **Fresh clones could not build the Android companion.** `android/gradlew` was
  tracked but `gradle/wrapper/gradle-wrapper.jar` was gitignored, so `gradlew`
  died with "could not find or load main class
  org.gradle.wrapper.GradleWrapperMain". The wrapper jar is now tracked, with
  the reasoning recorded at the point in `.gitignore` where it used to live.
- **`intel/report/prose.py` swallowed every Claude failure.** A bare
  `except Exception` fell back to templated prose with no record, so an auth
  error, a retired model id, or unparseable JSON all looked identical to
  "LLM prose disabled". Now logs at `exception` level with the stack before
  degrading. Verified end-to-end: a bogus API key produced a full trace where
  previously there was silence.
- Removed two dead expressions in `prose.py` (a discarded list comprehension
  and a dict literal built then thrown away).
- **`tui/ui/app.py` had two `on_mount` methods in one class.** The later
  definition silently won, so the first never ran. Verified the survivor is a
  superset (it already binds the exec session and starts `scd64_service`), so
  no behaviour was lost by deleting the dead copy.
- **`tui/ui/app.py` had a duplicated command-registration block** left by a
  merge, plus a truncated stub of `handle_memory` that the real definition
  shadowed. `CommandRegistry.register` is a plain dict write, so the duplicate
  was overwriting the live registrations with identical arguments — inert
  today, but any edit to them would have been silently undone.
- `app.py`'s `/vaelrix` error handler closed over the `except ... as e` binding
  inside a callback posted to the UI thread. Python deletes that binding when
  the `except` block exits. Not a live defect — `call_from_thread` blocks, so
  the block is still open — but it becomes a `NameError` the moment the post is
  deferred. Made robust by copying the message into a real local.
- `run.sh` installed dependencies from a floating package list, so a local run
  could drift from the exact pins CI audits with `pip-audit`. It now installs
  from `requirements-remote.txt`; `anthropic` stays a genuinely optional
  best-effort extra at a known-good pin.

### Added
- `LICENSE` (MIT) and `NOTICE` — the latter lists every bundled dependency's
  licence read from installed distribution metadata, not asserted from memory.
- `.github/workflows/divtube.yml`: `ruff check`, the previously-uncovered
  Android module (24 Kotlin files compiled by no CI job before), and an
  assertion that the wrapper trio survives in a checkout.
- `divtube_downloader/ruff.toml` enforcing `E401,E741,E9,F541,F811,F821` —
  verified zero violations across `tui/`, `intel/`, `src/` and `tests/`, so a
  CI failure is always a regression. Unenforced rules are listed with their
  real counts and the reason each needs judgement rather than a sweep.
- `divtube_downloader/settings.gradle` pinning `rootProject.name`.
- `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md` at the repo root
  (GitHub's vuln-reporting UI reads the root or `.github/`, not a module
  directory), plus issue and PR templates.
- `tests/test_osmosis_concentration_coupling.py` — locks the
  clamp/threshold coupling in `SubstrateOsmosisService` against both source
  text and exact decimal arithmetic.
- `test_allowed_bloat_stays_small_and_wrapper_coherent` — bounds the wrapper
  jar exemption by exact path **and** size, so the `.jar` bloat guard still
  catches vendored blobs.

### Verified
- 761 Python tests pass (was 754; +7 new). 30 JUnit validator tests pass.
  `gradle clean build` green with the new `settings.gradle`.
- Control tests: planting an inline `0.99` turns the coupling guard red while
  all five behavioural tests stay green — the exact blind spot that justified
  the source assertion. Inflating the wrapper jar past its ceiling, and
  smuggling a 3 MB vendored jar, are each caught by the bloat guard.
- `openai==3.3.1` confirmed to expose `APIStatusError` (a suspected break was
  disproved). `Gradle 9.4.1` in the wrapper properties confirmed correct for
  AGP 9.2.0 — the desktop/Android modules need different Gradle versions.

### Notes — audit claims I could not sustain
- **No precision bug in `substrate_osmosis_service.py`.** The `REAL`
  similarity/drift/concentration columns were flagged as a determinism risk;
  tested against `decimal.Decimal` across 20,001 value lengths, the float
  clamp and the `>=` threshold agree with exact intent on every input. The
  defect was the undocumented coupling, not the arithmetic.
- SQLite table-name and `key`/`value` reserved-word findings from P3C MySQL
  were **not** acted on: those rules protect Alibaba's managed-MySQL estate,
  and renaming 10 tables to buy a hypothetical migration is churn, not
  correctness.

## [Unreleased] — 2026-06-22

### Security
- **Removed hardcoded API keys** from `test_key.py` and `list_models.py`; both now
  read `GEMINI_API_KEY` from the environment and fail fast if it is unset.
- Added `_env.py` — a zero-dependency `.env` loader (real environment variables
  always take precedence over `.env` values).
- Added `.env.example` documenting every required key with placeholders.
- Added a local `divtube_downloader/.gitignore` so `.env`, `.venv/`, `build/`,
  `.gradle/`, `*.log`, `divtube_memory.db`, and `niche_database.sqlite` can never
  be committed.
- Deduplicated `.env` — collapsed four conflicting `CUSTOM_API_BASE` / `CUSTOM_MODELS_URL`
  blocks down to the single active provider (OpenCode).

> ⚠️ Any keys previously committed in plaintext should be treated as compromised
> and rotated (Gemini, xAI/Grok, OpenCode).

### Added
- **`Esc` now stops a running agent.** Cancels in-flight work and resets the
  loading bar: killable subprocesses (`/analyze`, `/download` via the Java
  backend) are terminated, and thread/network agents (`/critique`,
  `/scholomance`) are invalidated via a generation token so their late output is
  dropped. Bound in the footer as **Stop**; idle `Esc` is a no-op.
  (See `tests/test_agent_stop.py`.)
- **`@` file picker now connects to the Archive of Dominance.** When the
  Scholomance bridge is online, typing `@` searches the full corpus (~34K files)
  via server-side path matching instead of only the local project. Falls back to
  the local picker when the archive is offline.
- `ArchiveBridge.search_paths(query, limit)` and `ArchiveBridge.list_paths(limit)`
  — synchronous methods returning plain path lists for the picker.
- Filesystem-walk fallback for the `@` picker so it still populates when the
  project is untracked by git (respects the standard ignore dirs, caps at 5000
  entries).
- Regression test suite `tests/test_file_select_modal.py`.

### Fixed
- **`@` find-file modal crashed on every keystroke.** The modal's key handler was
  named `handle_key`, which collides with a reserved async hook on Textual's
  `Widget` (`_on_key` does `await self.handle_key(...)`); the sync override
  returned `None`, raising `TypeError: object NoneType can't be used in 'await'
  expression`. Renamed to `on_modal_key`.
- The `@` picker came up empty when `git ls-files` returned nothing (untracked
  project) — now backed by the filesystem-walk fallback above.

### Notes
- Archive searches spawn a short-lived Node subprocess per query (bridge design,
  warm from module cache). Searches are debounced to fire at ≥2 characters and run
  off the UI thread with a stale-result guard.

---

## [Unreleased] — 2026-06-22 (continued)

### Added

- **🧠 OOV Subject Resolution for NLU-AMP** — Design spec for wiring Datamuse
  `meansLike()` into the NLU pipeline to resolve out-of-vocabulary words
  (e.g. "reggaeton warrior"). Introduces `selectOOVCandidate()` (sync picker) +
  `resolveOOVSubject()` (async Datamuse lookup), fires only when no subject
  extracted, max one OOV word per prompt. Includes `build_oov_lexicon.mjs` —
  offline Datamuse enrichment with coherence clustering.
  (`docs/superpowers/specs/2026-06-22-oov-subject-resolution-design.md`)

- **📊 YouTube Intelligence SEO Critique Engine (`/intel <url>`)** — Fully
  operational deterministic SEO critique pipeline:
  - **Thumbnail engine** (291 lines) — Otsu thresholding, contrast, luminosity
  - **Title engine** (171 lines) — Construction rules scoring
  - **Tag engine** (171 lines) — Semantic clustering analysis
  - **Performance engine** (71 lines) — Telemetry banding
  - **Pipeline orchestrator** — Weighted composite scoring
  - **Schema** (`intel/schema.py`, 188 lines) — `SeoCritiqueResult`,
    `DeterminismInfo`, `Flag`
  - **Report renderer** — Markdown + prose output
  - **IntelLabService** — TUI integration
  - Fully deterministic: same input → byte-identical ledger. 10 test cases.
  (`intel/`, `build_youtube_intel.py`, `tui/services/intel_lab_service.py`)

- **🎨 Assonance Color Tier Design** — Third color tier for Truesight overlay:
  `rhyme` (glow) → `assonance` (soft tint) → `none` (grey). Old
  `Set<resonantCharStarts>` → `Map<charStart, 'rhyme' | 'assonance'>`.
  Assonance connections (~0.62 score) get a muted visual tier instead of being
  filtered out entirely.
  (`docs/superpowers/specs/2026-06-21-assonance-color-tier-design.md`)

- **🔁 SCD64 TokenWeight→SCD64 SCORE_DRIFT Loop** — First runtime detector to
  mint a confirmed SCD64 (SCORE_DRIFT family, v05, SCORING domain). Bridge
  `tokenWeightToSCD64` is confirmed-only, gated on real ranker evidence.
  Includes `SCORE_DRIFT` family registration in glossary +
  spatial-immune-orchestrator with sync-guard test.

### Fixed

- **SCD64 IntelliSense Matcher Hardening:**
  - Removed stale `src/core/scd64/RuleRegistry.js` fossil that shadowed the
    `.ts` under vite (missing RESONANCE_GHOST rule entirely)
  - Added assignment-context guard to RESONANCE_GHOST patterns —
    destructuring defaults (`resonantCharStarts = null`) no longer false-positive
  - Refactored `evaluateLegacyPatterns` → config-driven rules so one SCD64
    family can host multiple non-contaminating rules

- **🎨 Color Bug — Wrong School/Color for Vowel Nuclei** —
  `syllabifier.js syllabifyDeep` now folds the nucleus through
  `VOWEL_TO_BASE_FAMILY` + `normalizeVowelFamily` (matching `phoneme.engine`),
  fixing wrong school/color for AH/AY/OY/UH/AW nuclei. New
  `SCD64.COLOR_DRAGON.VOWELFAMILY_SOURCE` rule detects the raw-nucleus fossil.

### Tests
- SCORE_DRIFT family/bridge tests
- RuleRegistry precision + vowelFamily tests
- SyllabifyDeep folding tests
