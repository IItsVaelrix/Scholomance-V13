# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260718-ANALYZE-UI-RETRIEVAL
- **Feature / Fix Name:** Analyze UI + Retrieval slice and literary fallback provenance fix
- **Author / Agent:** Cursor backend agent
- **Date:** 2026-07-18
- **Branch / Environment:** `feat/lexical-graph-foundation` / local workspace
- **Related Task / Prompt:** Final review remediation for Analyze UI + Retrieval
- **Classification:** Multi-layer behavioral feature with a provenance fix
- **Priority:** High

## 2. Executive Summary

The Analyze slice adds a submit-only Read IDE analysis surface backed by the
lexical graph and dictionary adapters. It delivers eight result groups through
a server service and route, a client hook and `AnalyzePanel`, editor craft
actions, and the Read-page mount. Query-matched literary devices remain direct
results. When FTS has no device match, catalog fallback devices are now marked
`derived: true` and explicitly say `Catalog fallback (no FTS match)`, so the UI
does not imply that unrelated catalog entries were query matches. Status is
complete with the known follow-ups recorded below.

## 3. Scope of Change

### In Scope

- Lexicon and lexical-graph adapter retrieval methods.
- Eight-group `lexicalAnalyze` service, Analyze route, client hook, panel,
  craft actions, and Read IDE mount.
- Catalog-fallback provenance correction and regression coverage.

### Out of Scope

- Ranking redesign, cache policy changes, or broad Analyze chrome restyling.
- Treating loose, fallback, or generated material as a direct query match.

## 4. Implementation Details

### Shipped Surface

- Adapter methods expose dictionary and graph retrieval seams.
- `lexicalAnalyze.service.js` composes meaning, related language, oppositions,
  sound, phrases, literary techniques, symbols, and corpus examples.
- The route and `useLexicalAnalyze` hook provide submit-only retrieval.
- `AnalyzePanel` renders honest empty states and craft actions; `ReadPage`
  mounts it in Analyze mode.
- Literary FTS results retain direct provenance. Catalog fallback now retains
  its optional definition slice while always carrying the fallback note and
  `derived: true`.

### Honesty, Submission, and Origin Constraints

- No group fabricates a result: empty sources return explicit empty reasons.
- Loose or catalog-derived rows identify their derivation rather than claiming
  a match; the catalog path is specifically labeled as no-FTS-match fallback.
- Retrieval occurs only after explicit Analyze submission; no draft text is
  automatically transmitted or persisted.
- The client adapter uses same-origin API requests; no third-party query
  transport was added.

## 5. Validation Performed

- `npx vitest run tests/server/lexicalAnalyze.service.test.js tests/server/lexicalAnalyze.routes.test.js tests/server/lexicon.related.test.js`
  completed with 3 files and 10 tests passed. The review brief expected 9/9;
  the checked-in focused suite now contains 10 assertions, including the new
  catalog-fallback provenance regression.
- Prior slice evidence: headed real-stack Playwright 1/1, with screenshot
  scratchpad at `scratchpad/analyze-panel.png`.
- The new regression stubs an empty device FTS response and a catalog device,
  then asserts `derived: true` and `Catalog fallback (no FTS match)`.

## 6. Risk and Rollback

The behavioral change is isolated to the literary fallback item envelope.
Rollback is a revert of this fix commit; that would restore the misleading
unmarked catalog fallback and is therefore not recommended. Direct FTS matches
and every other Analyze group retain their prior behavior.

## 7. Known Gaps and Follow-Up Work

- `lookupRelated` LIMIT bucketing may deserve a dedicated ranking pass.
- Cache keys preserve query casing and could be normalized.
- The hook can add explicit abort handling for in-flight requests.
- CSS wrapper classes can be simplified.
- Analyze chrome title labels can be refined.

## 8. Commits

- Analyze slice: `cc516576..3abf36b3`
- Final-review fix: `fix(analyze): mark literary catalog fallback as derived + PIR`

## 9. Final Verdict

- [x] Complete with acceptable risk

The slice now preserves its submit-only and same-origin boundaries while making
the literary catalog fallback's non-match provenance explicit in the returned
data.
