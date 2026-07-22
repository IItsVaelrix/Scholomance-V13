# Phase 9 Complete: Production Integration

**Date:** 2026-07-20  
**Status:** ✅ Complete (flagged OFF by default)  
**PDR:** `PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2.md`

---

## What Shipped

### 1. Toolbar bridge (`src/core/compose/migrated/toolbar-bridge.ts`)
- `resolveVisibleToolbarActions` — host props → visible action ids
- `dispatchToolbarEvent` — `TOOLBAR.*` → TopBar handlers
- `mapTopBarPropsToToolbarBridge` — single entry for the React shell

### 2. Production shell (`ComposeScrollEditorToolbar.tsx`)
- Accepts TopBar callbacks + visibility gates
- Filters DomNodeSpec children without mutating golden scenes
- Memoized scene→DOM + `memo(DomTree)`
- Emits `PB-UI-EVENT-v1` then dispatches host handlers

### 3. Live `IDEChrome` TopBar swap
- When `compose:migrate:toolbar` is ON, the right action cluster renders the compose shell
- When OFF, classic icon buttons remain (rollback = disable flag)
- `useFeatureFlag` uses `useSyncExternalStore` for live toggles

### 4. Styling
- Minimal compose toolbar styles in `IDE.css` aligned with TopBar chrome

### 5. Tests
- `tests/qa/features/compose-phase9-production.test.tsx` (9 cases)

---

## How to Enable

```ts
import { featureFlags, COMPOSE_FLAGS } from 'src/core/compose/flags';
featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
```

Default: OFF. Public production must not rely on mutable localStorage alone (PDR §21).

---

## Out of Scope (later phases)

- Icon parity / WAND ornament live attach on TopBar
- Full documentation site (Storybook/Docusaurus) — consumer docs live in compose README + Migration Guide
- Skia / Vello (Phase 10)
- axe + Playwright visual baselines (Phase 11)
