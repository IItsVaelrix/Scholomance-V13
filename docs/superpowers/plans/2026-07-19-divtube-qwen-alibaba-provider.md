# DivTube Qwen / Alibaba Provider Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register international and China DashScope (Qwen/Alibaba) as OpenAI-compatible providers in DivTube Cockpit.

**Architecture:** Extend the existing `PROVIDERS` / `PROVIDER_ALIASES` table in `env_config.py`; reuse `get_openai_client` and live `/models` listing. No new HTTP client.

**Tech Stack:** Python TUI (`divtube_downloader`), unittest

## Global Constraints

- Default region for `qwen`/`alibaba`: international DashScope
- China via canonical `qwen-cn`
- Default model: `qwen3.7-max`
- Never commit API keys
- Spec: `docs/superpowers/specs/2026-07-19-divtube-qwen-alibaba-provider-design.md`

---

## File map

| File | Responsibility |
|------|----------------|
| `divtube_downloader/tests/test_model_picker.py` | Alias / URL / default model tests |
| `divtube_downloader/tui/services/env_config.py` | Provider registry |
| `divtube_downloader/tui/ui/app.py` | `/provider` usage string |
| `divtube_downloader/.env.example` | Example comments |
| `divtube_downloader/INSTRUCTION_MANUAL.md` | Provider docs |

---

### Task 1: Failing provider alias tests

**Files:**
- Modify: `divtube_downloader/tests/test_model_picker.py`

- [x] Add tests for `qwen` / `alibaba` / `dashscope` → intl URL + `qwen3.7-max`
- [x] Add tests for `qwen-cn` / `alibaba-cn` → China URL + `qwen3.7-max`
- [x] Run `python -m unittest tests.test_model_picker` — expect RED on new cases

### Task 2: Register providers

**Files:**
- Modify: `divtube_downloader/tui/services/env_config.py`

- [x] Add `qwen` and `qwen-cn` to `PROVIDERS`
- [x] Add aliases per design
- [x] Re-run tests — expect GREEN

### Task 3: Docs and UX strings

**Files:**
- Modify: `divtube_downloader/tui/ui/app.py`
- Modify: `divtube_downloader/.env.example`
- Modify: `divtube_downloader/INSTRUCTION_MANUAL.md`

- [x] Update `/provider` usage to mention qwen/alibaba/qwen-cn
- [x] Add DashScope example lines to `.env.example`
- [x] Update instruction manual provider note
- [x] Re-run `python -m unittest tests.test_model_picker`
