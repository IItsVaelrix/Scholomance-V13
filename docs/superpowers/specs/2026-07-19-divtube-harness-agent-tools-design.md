# DivTube Harness Agent Tools Design

**Date:** 2026-07-19  
**Status:** Approved for planning  
**Scope:** DivTube cockpit harness only (`tool_service.py` + bridge). No collab MCP mirrors. No Playwright/browser inspect.

## Goal

Close Qwen’s DivTube harness gaps so agents can create files, run tests/typecheck, inspect git history, locate diagnostic violations, preview heals, and bind CLI intents via Semantic Calculus — without shell-heredoc / stdout-regex workarounds.

## Decisions

| Topic | Choice |
|-------|--------|
| Slice | A + B + C (file/test/git/typecheck, violations paths, heal dry_run) — **not** frontend Playwright |
| Surface | DivTube harness only |
| `test_run` | Both `vitest` and `npm` runners |
| `file_create` on existing path | Fail unless `overwrite: true` |
| `scholo_gate` | Standalone tool only (no soft-gate on runners) |
| Integration style | Native tools in `tool_service.py`; bridge changes for heal dry_run + richer violations |

## Architecture

### New tools

| Tool | Args | Behavior | Return |
|------|------|----------|--------|
| `file_create` | `path`, `content`, `overwrite?` (default false) | Create file + parent dirs; error if exists unless overwrite | `{ ok, path, created, bytes }` |
| `test_run` | `runner`: `vitest` \| `npm`, `target?`, `suite?` (npm script, default `test`) | Run from Scholomance project root; parse structured results | `{ ok, runner, passed, failed, skipped, tests[], stdout_tail, exit_code }` |
| `git_history` | `path`, `mode`: `log` \| `blame`, `limit?` (default 20) | Structured `git log --follow` or `git blame` | `{ ok, mode, path, entries[] }` |
| `typecheck` | `project?` optional tsconfig path | `npm run typecheck` or `npx tsc -p … --noEmit` | `{ ok, errors: [{ file, line, column, code, message }], exit_code }` |
| `scholo_gate` | `intent`, `derived?`, `taint?`, `log?` | Shadow-only wrap of `scripts/scholo-gate.mjs` | `{ ok, intent, kind, bound, pick, risk, law, epistemic, confirmations_required, raw_tail }` |

### Diagnostics enrichment

`diagnostic_violations` keeps existing filters. Responses include per-violation `file_path`, `line`, `rule_id`, `severity`, `message`, and raw `context` when available. DivTube normalizes alternate keys (`filePath`, `path`, `loc.line`). Text summary prints `file_path:line`. Missing locations stay null — never invented.

### Heal dry_run

Optional `dry_run: true` on DivTube `heal` and bridge `heal --dry-run`.

- Dry run: diagnose → resolve pattern/patch/target → **no** file writes, **no** verification suite.
- Return: `{ dry_run: true, diagnosis, target_file, patch_preview, would_apply, would_test_suite }`.
- Default heal path unchanged.

Prefer passing a flag into the existing heal bridge / `IterativeHealer` opts over rewriting the full loop.

### scholo_gate details

- Wraps `scripts/scholo-gate.mjs` (Semantic Calculus; runs nothing).
- Prefer adding a `--json` flag to the script if ANSI CLI output is too brittle for agents; otherwise parse carefully and always include `raw_tail`.
- Agents must still call `test_run` / `run_command` after a `Do` bind — gate never executes.

## File map

| File | Responsibility |
|------|----------------|
| `divtube_downloader/tui/services/tool_service.py` | Register/implement tools; enrich violations; heal dry_run arg |
| `divtube_downloader/scripts/scholomance-bridge.mjs` | `heal --dry-run`; violations payload path/line if needed |
| `scripts/scholo-gate.mjs` | Optional `--json` output for agent consumption |
| `codex/core/immunity/iterative-healer.js` | Only if dry-run short-circuit belongs inside healer |
| `divtube_downloader/tests/` | Unit tests for parsers, file_create, dry_run wiring, violations normalize |

## Out of scope

- Playwright / React frontend inspection
- Collab MCP tool mirrors
- Soft-gating `run_command` / `test_run` through scholo-gate
- Changing RAID patterns or heal learning beyond dry-run short-circuit

## Testing

- Unit tests with fixture stdout for vitest/tsc parsers
- `file_create`: temp path → second create fails → succeeds with `overwrite: true`
- `scholo_gate`: known intent returns structured `kind` / `pick` (or skip if calculus env unavailable — document)
- `heal` dry_run: returns preview without mutating a fixture file
- `diagnostic_violations` formatter includes `file_path:line` when context provides them

## Success criteria

- Agent tool list exposes `file_create`, `test_run`, `git_history`, `typecheck`, `scholo_gate`
- Agents can create bridge files without shell heredocs
- `test_run` / `typecheck` return machine-readable pass/fail/error lists
- `git_history` returns structured log/blame without shell scraping
- `diagnostic_violations` includes locations when present in reports
- `heal` dry_run previews without writing
- `scholo_gate` binds intents without executing npm scripts
