# Compose Enter Portal Implementation Plan

> **For agentic workers:** Inline or SDD. Checkboxes track progress. **Do not auto-commit** unless user asks.

**Goal:** Always-on Compose Enter portal button with polish, compositor-friendly motion, and fidelity upgrades.

**Architecture:** `createEnterPortalScene` + `ComposeEnterPortal` wraps existing orb layers; storm/dissolve unchanged.

**Tech Stack:** React, Compose packets, Landing CSS, Vitest + jest-axe

## Global Constraints

- Always-on — no feature-flag gate for render
- Preserve Enter Scholomance aria-label, dissolve → /read, single-enter latch
- Prefer transform/opacity; respect prefers-reduced-motion
- Do not rewrite StormCanvas / WatercolorDissolve
- No auto-commits

---

### Task 1: Scene + golden ✅

- [x] Create `src/core/compose/migrated/EnterPortal.ts`
- [x] Create fixture `tests/qa/features/fixtures/enter-portal-button.pb-ui-scene.v1.json`
- [x] Create `tests/qa/features/compose-enter-portal-packet.test.ts`
- [x] Export via `packets.ts` / `index.ts`

Interfaces: `createEnterPortalScene()`, `ENTER_PORTAL_KIND`, `ENTER_PORTAL_ID`, `registerEnterPortalMigration()`

### Task 2: ComposeEnterPortal shell + Landing wire ✅

- [x] Create `src/core/compose/migrated/ComposeEnterPortal.tsx`
- [x] Modify `LandingPage.jsx` to always use it
- [x] Modify `LandingPage.css` for press/focus/perf/fidelity
- [x] Tests: `compose-enter-portal-shell.test.tsx` + twin-gate still green

### Task 3: Docs ✅

- [x] README + MIGRATION_GUIDE note always-on enter portal
- [x] Spec status → Implemented
