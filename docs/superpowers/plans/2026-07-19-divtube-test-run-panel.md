# DivTube Test Run Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace QBIT Field Radar with an animated TEST RUN panel driven by `test_run`.

**Architecture:** New `TestRunPanel` widget; stream progress from `run_tests`; cascade results on complete.

**Tech Stack:** Textual/Rich DivTube TUI, Python harness_tools

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-19-divtube-test-run-panel-design.md`
- Hybrid motion; remove radar from layout

---

### Task 1: Widget + layout swap
### Task 2: Stream hooks in harness_tools + tool_service
### Task 3: Unit tests for panel state helpers
