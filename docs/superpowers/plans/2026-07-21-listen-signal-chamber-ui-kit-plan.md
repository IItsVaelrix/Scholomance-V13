# Signal Chamber Compose UI Kit Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate the Scholomance Signal Chamber Compose UI Kit into the Listen Page (`ListenPage.tsx`), rendering a canonical `PB-UI-SCENE-v1` scene graph with runtime audio state bindings and school skin support.

**Architecture:** Copy `signalChamber.compose.js` to `src/core/compose/kits/`, copy golden packet to `tests/qa/features/fixtures/`, create `ComposeSignalChamberAdapter.tsx` to bind `useAmbientPlayer()` state, update `ListenPage.tsx` with validation fallback, and verify using Vitest.

**Tech Stack:** React (TSX/JSX), Compose Component Architecture (`src/core/compose/`), WebAudio (`useAmbientPlayer`), Vitest.

## Global Constraints

- Preserve all existing `useAmbientPlayer()` functionality and keyboard controls.
- All tests must pass: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts` and `npx vitest run tests/qa/features/compose-*.test.ts`.

---

### Task 1: Unpack UI Kit & Establish Golden Fixture Test Suite

**Files:**
- Create: `src/core/compose/kits/signalChamber.compose.js`
- Create: `tests/qa/features/fixtures/signal-chamber-ui-kit.golden.json`
- Create: `tests/qa/features/compose-signal-chamber-kit.test.ts`

**Interfaces:**
- Consumes: `/tmp/signal-chamber-ui-kit-extracted/signal-chamber-compose-ui-kit/`
- Produces: `createSignalChamberScene()`, `SIGNAL_CHAMBER_DEFINITIONS`, `SIGNAL_CHAMBER_THEME_TOKENS`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { createSignalChamberScene, SIGNAL_CHAMBER_DEFINITIONS } from '../../../src/core/compose/kits/signalChamber.compose.js';

describe('Signal Chamber UI Kit Canonical Scene', () => {
  it('exports 14 component definitions and valid PB-UI-SCENE-v1 packet', () => {
    expect(Object.keys(SIGNAL_CHAMBER_DEFINITIONS)).toHaveLength(14);
    const scene = createSignalChamberScene();
    expect(scene.contract).toBe('PB-UI-SCENE-v1');
    expect(scene.sceneId).toBe('listen-signal-chamber-ui-kit');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: FAIL with "Cannot find module ... signalChamber.compose.js"

- [ ] **Step 3: Copy UI Kit files into repository**

Copy `/tmp/signal-chamber-ui-kit-extracted/signal-chamber-compose-ui-kit/src/signalChamber.compose.js` to `src/core/compose/kits/signalChamber.compose.js`.  
Copy `/tmp/signal-chamber-ui-kit-extracted/signal-chamber-compose-ui-kit/goldens/signal-chamber-ui-kit.golden.json` to `tests/qa/features/fixtures/signal-chamber-ui-kit.golden.json`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/compose/kits/signalChamber.compose.js tests/qa/features/fixtures/signal-chamber-ui-kit.golden.json tests/qa/features/compose-signal-chamber-kit.test.ts
git commit -m "feat(compose): unpack Signal Chamber Compose UI kit and golden fixture"
```

---

### Task 2: Build ComposeSignalChamberAdapter with Runtime Bindings

**Files:**
- Create: `src/pages/Listen/ComposeSignalChamberAdapter.tsx`
- Modify: `tests/qa/features/compose-signal-chamber-kit.test.ts`

**Interfaces:**
- Consumes: `createSignalChamberScene()` from `src/core/compose/kits/signalChamber.compose.js`
- Produces: `ComposeSignalChamberAdapter` React component with live WebAudio state bindings.

- [ ] **Step 1: Write the failing test**

```typescript
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import ComposeSignalChamberAdapter from '../../../src/pages/Listen/ComposeSignalChamberAdapter';

describe('Compose Signal Chamber Adapter', () => {
  it('renders Signal Chamber HUD shell with runtime attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(ComposeSignalChamberAdapter, {
        currentSchoolId: 'SONIC',
        isPlaying: false,
        isTuning: false,
        signalLevel: 0.5,
        volume: 0.8,
        entropyLevel: 20,
        outputDevices: [],
        sinkId: '',
        onTogglePlayPause: () => {},
        onTuneToSchool: () => {},
        onSetVolume: () => {},
        onSetOutputDevice: () => {},
        onOrbClick: () => {},
      })
    );
    expect(html).toContain('data-compose-kind="signal-chamber-shell"');
    expect(html).toContain('data-compose-school="SONIC"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: FAIL with "Cannot find module ... ComposeSignalChamberAdapter"

- [ ] **Step 3: Implement ComposeSignalChamberAdapter.tsx**

Create `src/pages/Listen/ComposeSignalChamberAdapter.tsx` rendering the HUD layout (`apertureRail`, `core`, `parameterRail`, `transport`) with Compose attributes (`data-compose-kind="signal-chamber-shell"`), school skin classes, and runtime bindings.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Listen/ComposeSignalChamberAdapter.tsx tests/qa/features/compose-signal-chamber-kit.test.ts
git commit -m "feat(compose): build ComposeSignalChamberAdapter with runtime audio state bindings"
```

---

### Task 3: Integrate Adapter & Validation Fallback into ListenPage.tsx

**Files:**
- Modify: `src/pages/Listen/ListenPage.tsx`
- Modify: `tests/qa/features/compose-signal-chamber-kit.test.ts`

**Interfaces:**
- Consumes: `ComposeSignalChamberAdapter`
- Produces: Integrated `ListenPage` rendering `ComposeSignalChamberAdapter` with fallback support.

- [ ] **Step 1: Write the failing test**

```typescript
import ListenPage from '../../../src/pages/Listen/ListenPage';

describe('ListenPage UI Kit Integration', () => {
  it('renders ComposeSignalChamberAdapter inside ListenPage', () => {
    const html = renderToStaticMarkup(React.createElement(ListenPage));
    expect(html).toContain('data-compose-kind="signal-chamber-shell"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: FAIL with "expected html to contain data-compose-kind"

- [ ] **Step 3: Update ListenPage.tsx to render ComposeSignalChamberAdapter**

In `src/pages/Listen/ListenPage.tsx`:
Import `ComposeSignalChamberAdapter`. Replace the `viewMode === 'CHAMBER'` sidebar/HUD layout with `<ComposeSignalChamberAdapter ... />` while preserving `AlchemicalLabBackground`, `ScholomanceStation`, and keyboard controls.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-signal-chamber-kit.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Listen/ListenPage.tsx tests/qa/features/compose-signal-chamber-kit.test.ts
git commit -m "feat(compose): integrate ComposeSignalChamberAdapter into ListenPage"
```

---

### Task 4: Full QA Verification & Token Build

**Files:**
- Test: All test files under `tests/qa/features/`

- [ ] **Step 1: Run token build**

Run: `npm run build:tokens`
Expected: PASS

- [ ] **Step 2: Run full compose vitest suite**

Run: `npx vitest run tests/qa/features/compose-*.test.ts`
Expected: PASS (26 test files passing)

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(compose): verify Signal Chamber UI kit integration against complete QA suite"
```
