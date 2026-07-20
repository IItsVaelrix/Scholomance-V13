# Compose Update Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Always-on Compose chrome for the landing Update Ledger — raining title, CLI boot banner, denser polished console, ~30–40% taller gate.

**Architecture:** `createUpdateLedgerScene` emits `PB-UI-SCENE-v1`; React shell mounts DomSpec slots (header/boot/scroll); `DigitalRainText` shared with IDE; DivWand shell only if scene validation fails. Data path (`parseLedgerEntries` / JSON) unchanged.

**Tech Stack:** React, Compose packets (`src/core/compose`), Framer Motion, Vitest + jest-axe, existing Landing CSS tokens.

## Global Constraints

- Always-on Compose path — **no** feature-flag gate for render.
- Do not change `update-ledger.json` schema or entry fields.
- Respect `prefers-reduced-motion` (no rain scramble; boot lines static).
- Ledger must not overwhelm portal; viewport-clamped; ≤900px stack preserved.
- Commits only when the user explicitly asks (do not auto-commit).

---

### Task 1: Update Ledger Compose scene + golden

**Files:**
- Create: `src/core/compose/migrated/UpdateLedger.ts`
- Create: `tests/qa/features/fixtures/update-ledger-window.pb-ui-scene.v1.json`
- Create: `tests/qa/features/compose-update-ledger-packet.test.ts`
- Modify: `src/core/compose/packets.ts` (re-export factory)
- Modify: `src/core/compose/index.ts` (exports)

**Interfaces:**
- Produces: `createUpdateLedgerScene(options?: { entryCount?: number; includeWandOrnament?: boolean }): PbUiSceneV1`
- Produces: `UPDATE_LEDGER_KIND = 'update-ledger-window'`, `UPDATE_LEDGER_ID = 'update-ledger-window'`
- Produces: `createUpdateLedgerDefinition(): ScholComponentDefinitionV1`
- Produces: `registerUpdateLedgerMigration(): void`

- [ ] **Step 1: Write the failing packet test**

```ts
// tests/qa/features/compose-update-ledger-packet.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  canonicalizePacket,
  createUpdateLedgerScene,
  assertNoRuntimeLibraryObjects,
  validateComposeScene,
} from '../../../src/core/compose/packets';
import { contractRegistry, PB_UI_SCENE_V1, PB_LAYOUT_V1 } from '../../../src/core/compose/schema/contracts';

const FIXTURE = join(process.cwd(), 'tests/qa/features/fixtures/update-ledger-window.pb-ui-scene.v1.json');

describe('Update Ledger PB scene (compose pilot)', () => {
  beforeEach(() => {
    contractRegistry.clear();
    contractRegistry.register(PB_UI_SCENE_V1);
    contractRegistry.register(PB_LAYOUT_V1);
  });

  it('emits PB-UI-SCENE-v1 with header/boot/scroll children', () => {
    const scene = createUpdateLedgerScene({ entryCount: 3 });
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.root.kind).toBe('update-ledger-window');
    const ids = (scene.root.children ?? []).map((c) => c.id);
    expect(ids).toEqual([
      'update-ledger-window.header',
      'update-ledger-window.boot',
      'update-ledger-window.scroll',
    ]);
    expect(validateComposeScene(scene).ok).toBe(true);
    assertNoRuntimeLibraryObjects(scene);
  });

  it('matches golden after canonicalize', () => {
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8'));
    const emitted = createUpdateLedgerScene({ entryCount: 0, includeWandOrnament: false });
    expect(canonicalizePacket(emitted)).toBe(canonicalizePacket(golden));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-update-ledger-packet.test.ts`  
Expected: FAIL — `createUpdateLedgerScene` not exported / file missing

- [ ] **Step 3: Implement scene factory**

In `UpdateLedger.ts`, mirror `ScrollEditorToolbar.ts` patterns:

- Definition kind `update-ledger-window`, anatomy root + parts `header`, `boot`, `scroll`
- Capabilities: `focusable-controls` required, `semantic-text` required, `procedural-glow` optional
- Accessibility: `ariaRole: 'region'`, `aria-label` via props
- Layout: column flow (`direction: 'column'`, gap 12)
- Root children: three nodes with kinds `header` / `status` / `list` (or `region` parts with roles)
- Register known child kinds in `definitions` OR use kinds already in `KNOWN_KINDS` — if validator rejects, add definitions for each part kind or use `kind: 'button'` only for interactive; prefer defining part kinds on the parent definition anatomy and child nodes with `kind` registered in scene.definitions (copy toolbar pattern: children can be `kind: 'button'` — for ledger use simple container kinds registered in definitions map)
- `includeWandOrnament` default **false**
- `registerUpdateLedgerMigration` for tracking (optional flag `compose:migrate:ledger` in flags for registry only — **do not** gate render)

Export from `packets.ts` and `index.ts`.

Write golden by running factory once and writing canonicalize output to fixture file.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-update-ledger-packet.test.ts`  
Expected: PASS

---

### Task 2: DigitalRainText shared component

**Files:**
- Create: `src/components/DigitalRainText.jsx`
- Create: `src/components/DigitalRainText.css` (char cycling/settled styles; keep IDE classes working via shared class names or dual class)
- Modify: `src/pages/Read/IDEChrome.jsx` — MatrixTitle becomes thin wrapper around `DigitalRainText` **or** replace usage with `DigitalRainText` + `as="h1"` / `className="ide-title"`
- Create: `tests/qa/features/digital-rain-text.test.jsx`

**Interfaces:**
- Produces: `DigitalRainText({ text, as?: string, className?: string, animateOnMount?: boolean, enableGlow?: boolean })`
- Consumes: `usePrefersReducedMotion`, `freshRng`

- [ ] **Step 1: Write failing tests**

```jsx
// tests/qa/features/digital-rain-text.test.jsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import DigitalRainText from '../../../src/components/DigitalRainText.jsx';

vi.mock('../../../src/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: vi.fn(() => false),
}));

describe('DigitalRainText', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('renders accessible label with plain text when reduced motion', async () => {
    const { usePrefersReducedMotion } = await import('../../../src/hooks/usePrefersReducedMotion.js');
    usePrefersReducedMotion.mockReturnValue(true);
    render(<DigitalRainText text="Chronicle" as="h2" animateOnMount />);
    expect(screen.getByRole('heading', { name: 'Chronicle' })).toBeTruthy();
  });

  it('animates on mount when animateOnMount is true', () => {
    render(<DigitalRainText text="ABC" as="h2" animateOnMount className="rain" />);
    // initially cycling slots present
    expect(document.querySelectorAll('.digital-rain-char--cycling').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/qa/features/digital-rain-text.test.jsx`  
Expected: FAIL — module missing

- [ ] **Step 3: Implement DigitalRainText**

Extract scramble/settle from `MatrixTitle` in `IDEChrome.jsx`:

- Props: `text`, `as` (default `span`), `className`, `animateOnMount` (default `false` — IDE keeps change-only behavior), `enableGlow` (default `false`; IDE TopBar can pass `true`)
- When `animateOnMount`: run rain once on first mount (ledger use case)
- When `!animateOnMount`: keep current IDE behavior (rain only when `text` changes after first paint)
- Reduced motion: always plain text
- CSS: `.digital-rain-char--cycling` / `--settled`; IDE can map `.ide-title-char` via wrapper classes for parity

Refactor `MatrixTitle` to:

```jsx
function MatrixTitle({ title }) {
  return (
    <DigitalRainText
      text={title}
      as="h1"
      className="ide-title"
      enableGlow
      animateOnMount={false}
    />
  );
}
```

- [ ] **Step 4: Run tests + smoke IDE title still works via existing patterns**

Run: `npx vitest run tests/qa/features/digital-rain-text.test.jsx`  
Expected: PASS

---

### Task 3: ComposeUpdateLedger shell + UpdateLedgerWindow always-on

**Files:**
- Create: `src/core/compose/migrated/ComposeUpdateLedger.tsx` (or `.jsx` if preferred for Landing parity)
- Modify: `src/pages/Landing/UpdateLedgerWindow.jsx`
- Modify: `src/pages/Landing/UpdateLedgerWindow.css`
- Modify: `tests/pages/Landing/UpdateLedgerWindow.test.jsx`
- Create: `tests/qa/features/compose-update-ledger-shell.test.tsx`

**Interfaces:**
- Consumes: `createUpdateLedgerScene`, `renderSceneToDomSpec`, `validateComposeScene`, `DigitalRainText`, `parseLedgerEntries`, `ledgerShell` / `DivLayoutRenderer`
- Produces: always-on compose UI from `UpdateLedgerWindow`

- [ ] **Step 1: Write failing shell tests**

```tsx
// Key assertions
// - region name preserved
// - status chip CHRONICLE // ONLINE
// - boot line includes entries sealed: N
// - data-compose-ledger="true" on compose path
// - jest-axe clean on region
```

Also extend `UpdateLedgerWindow.test.jsx`:

```js
it('shows CLI boot lines with sealed entry count', async () => {
  render(<UpdateLedgerWindow source={SAMPLE_SOURCE} />);
  expect(await screen.findByText(/entries sealed:\s*1/i)).toBeTruthy();
  expect(screen.getByText(/CHRONICLE/i)).toBeTruthy();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/pages/Landing/UpdateLedgerWindow.test.jsx tests/qa/features/compose-update-ledger-shell.test.tsx`  
Expected: FAIL on new assertions

- [ ] **Step 3: Implement shell**

`ComposeUpdateLedger` responsibilities:

1. `const scene = createUpdateLedgerScene({ entryCount: entries.length })`
2. If `!validateComposeScene(scene).ok` → render legacy DivWand path (extract current JSX into `LegacyUpdateLedger`)
3. Else render console chrome:
   - Outer: `section.update-ledger.update-ledger--compose` `role="region"` `aria-label="Scholomance Update Ledger"`
   - Header: chip + `<DigitalRainText text="Scholomance Update Ledger" as="h2" animateOnMount />`
   - Boot: stateful lines; timers 400ms / 800ms / 1200ms (skip delays if reduced motion)
   - Scroll: existing `LedgerEntry` list / empty state
4. Wire `UpdateLedgerWindow` to always use compose path (fallback inside)

Boot copy exact:

```
> binding chronicle…
> entries sealed: ${N}
> ready.
```

- [ ] **Step 4: Polish CSS (console chrome)**

In `UpdateLedgerWindow.css`:

- Deeper frame / bevel on `.update-ledger--compose`
- Header flex: chip + title
- `.update-ledger__chip` monospace
- `.update-ledger__boot` monospace dim green/gold CLI lines
- Entry rows: date gutter, title, `-webkit-line-clamp: 2` on summary
- Slightly denser gap; living rim quieter idle / stronger `:focus-within`

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/pages/Landing/UpdateLedgerWindow.test.jsx tests/qa/features/compose-update-ledger-shell.test.tsx tests/qa/features/compose-update-ledger-packet.test.ts`  
Expected: all PASS

---

### Task 4: Twin-gate size balance

**Files:**
- Modify: `src/pages/Landing/LandingPage.css` (`.landing-gate--ledger` heights)

**Interfaces:**
- Consumes: current `min(58vh, 34rem)` portal/ledger caps
- Produces: ledger ~30–40% taller content area, equal weight

- [ ] **Step 1: Adjust ledger gate dimensions**

Desktop (approx):

```css
.landing-gate--ledger {
  height: min(78vh, 44rem);      /* was 58vh / 34rem → ~35% taller */
  max-height: min(78vh, 44rem);
}
```

Mobile `@media (max-width: 900px)`:

```css
.landing-gate--ledger {
  height: min(56vh, 32rem);      /* was 42vh / 24rem */
  max-height: min(56vh, 32rem);
}
```

Keep portal min-heights as today so ledger does not exceed portal dominance.

- [ ] **Step 2: Manual check**

Run: `npm run dev` → open `/`  
Expected: ledger ≈ equal weight to portal; more entries visible; stack OK on narrow width

---

### Task 5: Docs + export cleanup

**Files:**
- Modify: `src/core/compose/README.md` (note ledger pilot always-on)
- Modify: `src/core/compose/MIGRATION_GUIDE.md` (ledger section)
- Modify: `docs/superpowers/specs/2026-07-20-compose-update-ledger-design.md` status → Implemented (when done)

- [ ] **Step 1: Document always-on ledger pilot and factory API**
- [ ] **Step 2: Run full related suite**

```bash
npx vitest run \
  tests/qa/features/compose-update-ledger-packet.test.ts \
  tests/qa/features/compose-update-ledger-shell.test.tsx \
  tests/qa/features/digital-rain-text.test.jsx \
  tests/pages/Landing/UpdateLedgerWindow.test.jsx
```

Expected: all PASS

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| Hybrid rain + boot + stagger | 2, 3 |
| Balanced size ~30–40% | 4 |
| Always-on Compose | 3 |
| Scene header/boot/scroll | 1 |
| DigitalRainText shared | 2 |
| DivWand fallback | 3 |
| Reduced motion | 2, 3 |
| Golden + a11y tests | 1, 3 |
| No JSON schema change | (constraint) |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-20-compose-update-ledger.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  

**2. Inline Execution** — execute tasks in this session with checkpoints  

Which approach?
