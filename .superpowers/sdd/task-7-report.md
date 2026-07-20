# Task 7 Report: Playwright twin-gate verification

**Status:** COMPLETE  
**Branch:** `feat/update-ledger`  
**Date:** 2026-07-19

## Summary

Added Playwright e2e coverage for Landing twin-gate geometry, responsive stack, ledger focus isolation, and portal Enter → `/read`. Geometry assertions passed without CSS layout changes. Focus test required a small production fix: `tabIndex={0}` on the Update Ledger region (plus shared `:focus-visible` styling).

## Commits

| SHA | Message |
|-----|---------|
| `90bbd183` | `fix(landing): make Update Ledger region keyboard-focusable` |
| `97f70e52` | `test(e2e): verify landing twin-gate geometry and enter path` |

## Files

### Created
- `tests/qa/e2e/landing-twin-gate.spec.js` — three chromium e2e cases from brief

### Modified (necessary for e2e PASS)
- `src/pages/Landing/UpdateLedgerWindow.jsx` — `tabIndex={0}` on ledger `role="region"`
- `src/pages/Landing/UpdateLedgerWindow.css` — `:focus-visible` ring on `.update-ledger` (shared with entries)

### Untouched (per instruction)
- Visualiser track dirt, alignment assets, `.worktrees/`, etc.

## Verification

### Playwright
```bash
npx playwright test tests/qa/e2e/landing-twin-gate.spec.js --project=chromium
```
**Result:** 3 passed (after Chromium install + focus fix)

| Test | Result |
|------|--------|
| desktop shows balanced gates; enter still reaches /read | PASS |
| narrow stacks portal above ledger | PASS |
| ledger region is keyboard-focusable without navigating | PASS (after `tabIndex={0}`) |

Initial run failed only on focusability (`Received: inactive`). Desktop side-by-side and narrow stack geometry did not need CSS layout fixes. Dissolve/enter path still reaches `/read` under `prefers-reduced-motion: reduce`.

### Vitest regression
```bash
npx vitest run tests/qa/modulation/div-layout.test.js tests/features/divwand/DivLayoutRenderer.test.jsx tests/pages/Landing tests/scripts/add-update-ledger-entry.test.js
```
**Result:** 6 files / 42 tests passed

## Spec checklist (Task 7 scope)

| Spec requirement | Covered |
|------------------|---------|
| Twin-gate layout + responsive stack | Yes (desktop + narrow geometry) |
| Playwright geometry | Yes |
| Dissolve orb-only / no ledger nav | Yes (Enter on ledger stays on `/`; portal Enter → `/read`) |
| Motion + reduced-motion | Exercised via `emulateMedia({ reducedMotion: 'reduce' })` on enter path |

## Concerns

1. **Ledger now has two tab stops** — region (`tabIndex={0}`) and entries list (`tabIndex={0}`). Acceptable for e2e/a11y of the shell; may want a follow-up to consolidate focus to one primary control if tab order feels noisy.
2. **Playwright browsers** — environment needed `npx playwright install chromium` before e2e could run (SteamOS / non-official Playwright OS fallback).
3. **Existing smoke e2e** (`tests/qa/e2e/smoke.spec.js`) still expects `/` → `/read` automatically; not part of this task, but may be stale relative to Landing twin-gate.

## Spec coverage handoff

Task 7 complete. Twin-gate Playwright geometry + enter/focus isolation locked.

---

## Fix wave — Important findings (2026-07-19)

**Status:** COMPLETE  
Resolved review concerns #1 (dual tab stops) and #3 (stale smoke twin-gate expectation).

### Changes

| Area | Change |
|------|--------|
| `UpdateLedgerWindow.jsx` | Removed `tabIndex={0}` from region; sole focus stop remains on scrollable `.update-ledger__entries` |
| `UpdateLedgerWindow.css` | Focus ring only on entries list |
| `landing-twin-gate.spec.js` | Focuses scrollable `list` inside region; Enter still stays on `/` |
| `smoke.spec.js` | Portal click → `/read`; nav asserts current rail + chambers Portal; Lexical editor save/reload |
| `user-journey.spec.js` | Goes directly to `/auth` (not Landing auto-route) |
| `UpdateLedgerWindow.test.jsx` | Asserts single `[tabindex="0"]` on entries |

### Verification

```bash
npx playwright test tests/qa/e2e/landing-twin-gate.spec.js --project=chromium
# 3 passed

npx playwright test tests/qa/e2e/landing-twin-gate.spec.js tests/qa/e2e/smoke.spec.js --project=chromium
# 5 passed

npx vitest run tests/pages/Landing/UpdateLedgerWindow.test.jsx
# 4 passed

npx playwright test tests/qa/e2e/user-journey.spec.js --project=chromium
# 1 passed
```

### Note

`combat.spec.js` still fails independently (TRACE BUFFER overlay intercepts Cast click) — out of twin-gate/smoke fix scope.
