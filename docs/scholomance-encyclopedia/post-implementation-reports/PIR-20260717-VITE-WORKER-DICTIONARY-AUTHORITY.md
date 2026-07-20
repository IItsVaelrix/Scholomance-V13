# Post-Implementation Report

## 1. Change Identity

- **Report ID:** PIR-20260717-VITE-WORKER-DICTIONARY-AUTHORITY
- **Feature / Fix Name:** Vite worker dictionary authority boundary
- **Author / Agent:** Codex Root
- **Date:** 2026-07-17
- **Branch / Environment:** main / local workspace
- **Related Task:** e6d209c9-d47a-413f-829e-191141065073
- **Classification:** Structural bug fix
- **Priority:** High

## 2. Executive Summary

The production client build failed because Vite followed a Node-only dictionary
adapter from the microprocessor Web Worker graph. That adapter reached
`node:fs`, whose `existsSync` export is unavailable in Vite's browser
external shim. The fix keeps the server adapter behind an opaque, Node-only
runtime import while preserving browser fetch authority and Node self-SQLite
authority. The production Vite build and the focused authority tests pass after
the change.

## 3. Intent and Reasoning

### Problem Statement

`npm run build:app` failed in `vite:worker-import-meta-url` while compiling
`codex/core/shared/microprocessor.worker-client.js`.

### Why This Change Was Chosen

The existing environment behavior is intentional: browser calls use the
Scholomance Dictionary HTTP API, while Node bake/server/test calls use the
in-process SQLite authority. Making the Node module specifier opaque to Vite
removes the server module from the worker graph without changing that behavior.

### Assumptions Made

- The server adapter is only evaluated when `isNode()` is true.
- Node ESM resolves the runtime module specifier relative to
  `primeAuthority.js`.
- Vite honors `/* @vite-ignore */` for the runtime-only dynamic import.

### Alternatives Considered

- Remove the Node fallback and require every caller to inject
  `dictionaryAPI`.
- Create separate browser and Node microprocessor registries.
- Externalize `node:fs` in Vite configuration.

### Why Alternatives Were Rejected

Removing the fallback would change tested Node behavior. Split registries would
be broader than the reported failure. Externalizing `node:fs` would hide the
symptom while leaving a server/SQLite graph inside the browser worker.

## 4. Scope of Change

### In Scope

- Stop Vite from statically bundling the Node dictionary adapter into the
  microprocessor worker.
- Preserve current Node and browser dictionary authority behavior.
- Normalize punctuation flagged by the immunity scanner in the changed file.

### Out of Scope

- Refactoring the complete microprocessor registry.
- Removing other existing Vite browser-external warnings.
- Changing dictionary schemas, scoring, UI, persistence, or API behavior.

### Change Type

- [x] Logic only
- [x] Build / tooling
- [x] Documentation
- [ ] API contract
- [ ] Data model
- [ ] Persistence layer
- [ ] UI

## 5. Files and Systems Touched

| Area | File / Module | Type | Risk | Notes |
|---|---|---|---|---|
| Logic | `codex/core/microprocessors/dict/primeAuthority.js` | Runtime import boundary | Medium | Preserves environment selection |
| Docs | This PIR | Documentation | Low | Records evidence and rollback |

### Dependency Impact Check

- **Imports changed:** Literal server dynamic import became a Vite-ignored
  runtime specifier.
- **Shared state affected:** None.
- **Event flows affected:** None.
- **UI consumers affected:** None.
- **Data consumers affected:** Dictionary priming behavior is unchanged.
- **External services affected:** None.
- **Config/env affected:** None.

## 6. Implementation Details

### Before

Vite could statically analyze
`import('../../../server/adapters/selfDictionary.authority.js')` and pulled
the SQLite adapter, path resolution utility, and `node:fs` into the worker.

### After

The Node-only path is stored in a runtime constant and imported with
`/* @vite-ignore */`. Browser workers never evaluate that branch; Node still
loads the same adapter.

### Architectural Notes

This patch is a narrow bundler boundary. A later architecture pass may replace
the runtime server dependency with explicit dependency injection, but that
would require coordinated test and caller updates.

### Tradeoffs Accepted

- The Node-only dependency remains runtime-resolved rather than statically
  discoverable by Vite.
- Other pre-existing browser-external warnings remain visible.

## 7. Behavior Changes

### User-Facing Behavior Changes

- Production client builds no longer fail on `node:fs` from the dictionary
  authority path.

### Internal Behavior Changes

- Vite no longer includes the self-SQLite server adapter in the browser worker
  dependency graph.

## 8. Risk Analysis

### Primary Risks Introduced

- A future rename of the server adapter path would surface only when the Node
  fallback executes.
- A future bundler could interpret the ignore directive differently.

### Blast Radius

- [x] Isolated
- [ ] Moderate
- [ ] Wide
- [ ] Unknown

### Risk Reduction Measures Taken

- Ran the Node self-SQLite authority test.
- Ran the synthesis authority test.
- Ran targeted ESLint.
- Ran the production client build.
- Ran the Scholomance immunity scan.

### Rollback Readiness

- [x] Easy rollback

### Rollback Method

Restore the literal dynamic import in
`codex/core/microprocessors/dict/primeAuthority.js`. This also restores the
reported Vite failure, so rollback is only appropriate if the Node runtime
import regresses.

## 9. Validation Performed

### Manual Validation

- [x] Reproduced the original build failure before editing.
- [x] Confirmed the emitted worker and authority chunks after editing.

### Automated Validation

- [x] Focused tests passed.
- [x] Targeted lint passed.
- [x] Build passed.
- [x] Immunity scan passed.
- [x] Full repository test suite run.
- [ ] E2E suite run.

### Exact Validation Notes

- `npx vitest run tests/core/microprocessors/dict-prime-authority.test.js tests/core/truesight/synthesisProcessor.authority.test.js`:
  2 files and 2 tests passed.
- `npx eslint codex/core/microprocessors/dict/primeAuthority.js --report-unused-disable-directives --quiet`:
  exit 0.
- `npm run build:app`: exit 0; Vite built 3311 modules and emitted
  `microprocessor.worker-*.js`.
- Scholomance immunity scan: CLEAN.
- `npm run polish`: PASS; full QA and production build passed with no blockers.

## 10. Regression Checklist

- [x] No broken imports in the verified build.
- [x] No schema drift introduced.
- [x] No duplicated runtime logic introduced.
- [x] No unsafe fallback behavior introduced.
- [x] Existing Node self-SQLite test remains green.

### Specific Retest Areas

- Browser fallback synthesis when the panel-analysis endpoint is unavailable.
- Node visualizer Truesight bake using the self-SQLite dictionary authority.
- Future Vite upgrades that change dynamic import handling.

## 11. Performance and Stability Notes

### Performance Impact

- [x] Neutral

### Stability Impact

- [x] Improved

### Metrics / Evidence

The worker no longer absorbs the SQLite server graph. No runtime loop or data
shape changed.

## 12. Security / Safety / Data Integrity Review

- **Auth impact:** None.
- **Permissions impact:** None.
- **Input validation impact:** None.
- **Data integrity concerns:** None identified; dictionary source behavior is
  unchanged.
- **Logging / audit trail concerns:** None.
- **Secrets / env exposure risk:** No new exposure.
- **Unsafe execution paths introduced?:** No; the import remains guarded by the
  existing Node environment check.
- **Security follow-up needed?:** No.

## 13. Documentation Updates

- [x] PIR added.
- [ ] README update needed.
- [ ] API docs update needed.
- [ ] Schema update needed.

No public API or schema changed.

## 14. Known Gaps and Follow-Up Work

### Known Incomplete Areas

- Existing Vite warnings for other Node built-ins were not part of this fix.
- The core-to-server runtime dependency remains a candidate for a coordinated
  dependency-injection refactor.

### Follow-Up Recommendations

- Gemini should add a focused worker-bundle regression test if the build gate is
  not already exercised in CI.

### Deferred Work

- Split environment-specific authority composition into an outer adapter layer.

## 15. Final Verdict

- [x] Complete with acceptable risk

The reported build blocker is removed with a one-file runtime-boundary change,
and both dictionary authority modes remain covered by the focused verification.
