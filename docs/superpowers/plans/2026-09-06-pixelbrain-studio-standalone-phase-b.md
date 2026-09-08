# PixelBrain Studio Standalone Phase B Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this work is tightly coupled around one document controller). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the standalone PixelBrain Studio as a coherent nine-tab authoring application whose default Canvas & Aseprite tab supports serious pixel-art work while preserving deterministic, browser-safe PixelBrain behavior.

**Architecture:** Keep the frozen 14-function Phase-A facade. Add a second, narrow `studio-authoring-facade.js` over a revisioned document controller plus bounded browser-safe editor/Aseprite/forge-core/finish closures. One document authority; Canvas is the default route.

**Tech Stack:** React 19, TanStack Start/Router, TypeScript, JavaScript ESM, Tailwind v4 plus scoped `pbs-*` CSS, Node test runner, Playwright/Chromium, fflate.

**Spec:** `docs/scholomance-encyclopedia/PDR-archive/2026-09-06-pixelbrain-studio-standalone-phase-b-pdr.md`

## Global Constraints

- Exact nine source tabs in source order; Canvas is the default for `/`, `/studio`, missing, and invalid tabs.
- Phase-A facade remains exactly 14 exports.
- Production target code has no imports from root `src/`, root `codex/`, Node filesystem APIs, root auth/database code, or server-only adapters.
- Indexed palette hard ceiling: 32 colors after deterministic reduction.
- Undo history cap: `COMMAND_HISTORY_LIMIT = 50`. Terminal/event cap: `EVENT_HISTORY_LIMIT = 40`. Ledger cap remains 20.
- Working size 160×144; warning above 512 on either axis; hard limit 1024; Aseprite import 512×512, 256 frames, 64 layers, 262144 cells.
- No auth, telemetry, remote AI, autosave, or cloud persistence. Keep locally is explicit.
- Observed sampling fails with `PB-STUDIO-FORGE-CAPABILITY`; never fabricate it.
- Finish outputs keyed by content + checksum + style/school + versioned algorithm identity; never `Date.now()`.
- SWARD visual language; professional feel from hierarchy and precision, not glow.
- Every behavior follows red-green-refactor. Completion claims require fresh evidence.

---

Stages follow PDR §13. Each stage leaves the standalone app runnable.
