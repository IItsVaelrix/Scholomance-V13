# Phase 11 Complete: Advanced Validation

**Date:** 2026-07-20  
**Status:** ✅ Complete  
**PDR:** `PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2.md` §23.4 / new commands

---

## What Shipped

### 1. axe-core audit adapter
- `src/core/compose/validate/a11y-audit.ts`
- `auditComposeA11y(element)` → `PB-UI-008` diagnostics
- Dynamic `import('axe-core')` so audits stay out of the cold path

### 2. Vitest a11y suite
- `tests/qa/features/compose-phase11-a11y.test.tsx`
- jest-axe on `ComposeScrollEditorToolbar`
- Negative case: unlabeled button → fail + `PB-UI-008`

### 3. Playwright visual + axe
- `tests/visual/compose-toolbar-a11y.spec.js`
- Enables migrate flag via `window.__COMPOSE_FLAGS__` + `syncComposeFlagsFromWindow`
- AxeBuilder on `[data-testid="compose-topbar-actions"]`
- Screenshot baseline: `compose-topbar-actions.png`
- Contrast fix for compose toolbar buttons (WCAG AA)

### 4. npm scripts (PDR §23.6)
| Script | Target |
|---|---|
| `ui:a11y:test` | Phase 11 vitest + Playwright compose a11y |
| `ui:contracts:test` | Phase 1 + packet golden |
| `ui:layout:test` | layout + taffy |
| `ui:events:test` | behavior |
| `ui:render:test` | Phase 10 |
| `ui:benchmark` | benchmarks |
| `ui:schema:validate` | schema + golden |

### 5. CI
`.github/workflows/test.yml` runs `ui:a11y:test` and compose contract/layout/render suites.

---

## How to run

```bash
npm run ui:a11y:test
# or separately:
npx vitest run tests/qa/features/compose-phase11-a11y.test.tsx
npx playwright test tests/visual/compose-toolbar-a11y.spec.js --project=chromium
```
