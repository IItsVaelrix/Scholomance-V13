# DivTube Harness Agent Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add DivTube harness tools for file_create, test_run, git_history, typecheck, scholo_gate; enrich diagnostic_violations; add heal dry_run.

**Architecture:** Pure helpers in `harness_tools.py`; wire into `tool_service.py`; optional `--json` on `scholo-gate.mjs`; bridge/healer dry_run short-circuit.

**Tech Stack:** Python DivTube TUI, Node bridge, vitest/tsc/git CLI

## Global Constraints

- DivTube-only (no MCP mirrors, no Playwright)
- `file_create` fails unless `overwrite: true`
- `test_run` supports vitest + npm
- Spec: `docs/superpowers/specs/2026-07-19-divtube-harness-agent-tools-design.md`

---

### Task 1: Helpers + unit tests

**Files:**
- Create: `divtube_downloader/tui/services/harness_tools.py`
- Create: `divtube_downloader/tests/test_harness_tools.py`

- [x] Parsers for tsc errors, vitest JSON, violation normalize, git log/blame shaping
- [x] file_create / path safety tests

### Task 2: Wire tools into tool_service

**Files:**
- Modify: `divtube_downloader/tui/services/tool_service.py`

- [x] Register tools + dispatch handlers
- [x] Enrich `_diagnostic_violations`
- [x] Pass `dry_run` to heal

### Task 3: Bridge heal dry_run + scholo-gate --json

**Files:**
- Modify: `divtube_downloader/scripts/scholomance-bridge.mjs`
- Modify: `scripts/scholo-gate.mjs`
- Modify: `codex/core/immunity/iterative-healer.js` (if needed)

- [x] heal dry_run returns preview without writes
- [x] scholo-gate `--json` structured payload
