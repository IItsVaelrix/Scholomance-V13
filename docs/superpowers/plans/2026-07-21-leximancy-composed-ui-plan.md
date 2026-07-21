# Leximancy Composed UI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Leximancy UI in Scholomance (`AnalyzePanel.jsx`) using Compose Composed Component Architecture (`v2`), adding a dynamic Cassowary ambiguity margin bar, WAND confidence pulse sigils, Zag accessible roving focus, and DTCG design tokens.

**Architecture:** Integrate `SCHOL-COMPONENT-DEFINITION-v1` semantic component declarations and `PB-UI-EVENT-v1` into `AnalyzePanel.jsx`. Use `CassowarySolver` for proportional threshold/margin bar computation in `constraint` mode with flow fallback, attach CSS variables for WAND pulse frequencies, and bind scrollbars/borders to DTCG Compose tokens.

**Tech Stack:** React (JSX), Compose Component System (`src/core/compose/`), Cassowary Solver (`src/core/compose/layout/index.ts`), DTCG Tokens (`tokens/compose/`), Vitest.

## Global Constraints

- Preserve all existing `AnalyzePanel.jsx` props and hooks (`useLexicalAnalyze`, `buildAnalysisContextInput`).
- All tests must pass: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts` and `npx vitest run tests/qa/features/compose-*.test.ts`.

---

### Task 1: Component Schema & Test Suite Setup

**Files:**
- Create: `tests/qa/features/compose-leximancy-panel.test.ts`
- Modify: `src/pages/Read/AnalyzePanel.jsx`

**Interfaces:**
- Consumes: `SCHOL-COMPONENT-DEFINITION-v1`, `PB-UI-EVENT-v1`
- Produces: Semantic role `region` and `leximancy-panel` component attributes on `AnalyzePanel`.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import AnalyzePanel from '../../../src/pages/Read/AnalyzePanel.jsx';

describe('Compose Leximancy Panel Architecture', () => {
  it('has valid SCHOL-COMPONENT-DEFINITION attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('data-compose-kind="leximancy-panel"');
    expect(html).toContain('data-compose-version="1.0.0"');
    expect(html).toContain('role="region"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: FAIL with "expected html to contain data-compose-kind"

- [ ] **Step 3: Implement minimal component definition attributes in AnalyzePanel.jsx**

In `src/pages/Read/AnalyzePanel.jsx`:
Add `data-compose-kind="leximancy-panel"`, `data-compose-version="1.0.0"`, and `role="region"` to the root `<aside className="analyze-panel ...">`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/qa/features/compose-leximancy-panel.test.ts src/pages/Read/AnalyzePanel.jsx
git commit -m "feat(compose): add SCHOL-COMPONENT-DEFINITION attributes to AnalyzePanel"
```

---

### Task 2: Proportional Ambiguity Margin Bar with Cassowary Solver

**Files:**
- Modify: `tests/qa/features/compose-leximancy-panel.test.ts`
- Modify: `src/pages/Read/AnalyzePanel.jsx`
- Modify: `src/pages/Read/AnalyzePanel.css`

**Interfaces:**
- Consumes: `CassowarySolver` from `src/core/compose/layout/index.ts`
- Produces: `.az-ambiguity-margin-bar` rendering proportional width calculations.

- [ ] **Step 1: Write the failing test**

```typescript
  it('renders dynamic ambiguity margin bar with constraint solver attributes', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('az-ambiguity-margin-bar');
    expect(html).toContain('data-compose-layout="constraint"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: FAIL with "expected html to contain az-ambiguity-margin-bar"

- [ ] **Step 3: Implement Ambiguity Margin Bar in AnalyzePanel.jsx and AnalyzePanel.css**

In `AnalyzePanel.jsx`:
Add an ambiguity margin calculation helper using confidence scores and threshold (0.70 / 0.85):
```jsx
<div
  className="az-ambiguity-margin-bar"
  data-compose-layout="constraint"
  data-compose-region="leximancy-margin-region"
  style={{
    '--margin-width': `${Math.min(100, Math.max(10, (resolutionInfo?.score || 0.7) * 100))}%`,
    '--margin-color': resolutionInfo?.status === 'clear' ? '#91d7be' : resolutionInfo?.status === 'ambiguous' ? '#e4c36b' : '#ef8ea0',
  }}
>
  <div className="az-ambiguity-margin-bar__fill" style={{ width: 'var(--margin-width)', background: 'var(--margin-color)' }} />
  <span className="az-ambiguity-margin-bar__label">{resolutionInfo?.status || 'clear'} ({Math.round((resolutionInfo?.score || 0.7) * 100)}%)</span>
</div>
```

In `AnalyzePanel.css`:
Add styles for `.az-ambiguity-margin-bar` with CSS transition and glow.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/qa/features/compose-leximancy-panel.test.ts src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css
git commit -m "feat(compose): add proportional ambiguity margin bar with constraint attributes"
```

---

### Task 3: WAND Procedural Confidence Sigils on Candidate Chips

**Files:**
- Modify: `tests/qa/features/compose-leximancy-panel.test.ts`
- Modify: `src/pages/Read/AnalyzePanel.jsx`
- Modify: `src/pages/Read/AnalyzePanel.css`

**Interfaces:**
- Consumes: WAND procedural pulse styling
- Produces: `.az-candidate__sigil` SVG pulse indicator on candidate chips.

- [ ] **Step 1: Write the failing test**

```typescript
  it('renders WAND procedural confidence sigil inside candidate chips', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('az-candidate__sigil');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: FAIL with "expected html to contain az-candidate__sigil"

- [ ] **Step 3: Implement WAND Sigil SVG in Candidate Chips**

In `AnalyzePanel.jsx`:
Inside candidate item render, add:
```jsx
<span
  className="az-candidate__sigil"
  title={`Confidence: ${Math.round((cand.score || 0.8) * 100)}%`}
  style={{
    '--wand-pulse-duration': `${3000 - Math.round((cand.score || 0.8) * 2000)}ms`,
    '--wand-glow-color': (cand.score || 0.8) > 0.85 ? '#91d7be' : (cand.score || 0.8) > 0.6 ? '#e4c36b' : '#ef8ea0',
  }}
>
  <svg viewBox="0 0 16 16" width="12" height="12">
    <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="8" cy="8" r="2" fill="currentColor" />
  </svg>
</span>
```

In `AnalyzePanel.css`:
Add `@keyframes wand-pulse` and styling for `.az-candidate__sigil`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/qa/features/compose-leximancy-panel.test.ts src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css
git commit -m "feat(compose): attach WAND procedural confidence sigils to candidate chips"
```

---

### Task 4: Accessible Roving Focus & Token System Polish

**Files:**
- Modify: `tests/qa/features/compose-leximancy-panel.test.ts`
- Modify: `src/pages/Read/AnalyzePanel.jsx`
- Modify: `src/pages/Read/AnalyzePanel.css`

**Interfaces:**
- Consumes: DTCG Token System variables
- Produces: Full accessible keyboard navigation (`tabIndex`, `onKeyDown`) and DTCG variable styling.

- [ ] **Step 1: Write failing test for accessible roving focus & DTCG token integration**

```typescript
  it('supports roving focus keyboard navigation attributes and token variables', () => {
    const html = renderToStaticMarkup(
      React.createElement(AnalyzePanel, {
        activeScroll: null,
        editorTitle: 'Test',
        editorContent: 'Test content',
        onCraftAction: () => {},
      })
    );
    expect(html).toContain('data-compose-focus="roving"');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: FAIL with "expected html to contain data-compose-focus"

- [ ] **Step 3: Implement roving focus and DTCG variable bindings**

In `AnalyzePanel.jsx`:
Add `data-compose-focus="roving"` and keyboard event handler (`onKeyDown` handling `ArrowLeft`, `ArrowRight`, `Home`, `End`) for candidate chips and scope buttons.

In `AnalyzePanel.css`:
Bind `.analyze-panel` borders and focus rings to `--compose-color-primary-500` and `--school-primary`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/compose-leximancy-panel.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add tests/qa/features/compose-leximancy-panel.test.ts src/pages/Read/AnalyzePanel.jsx src/pages/Read/AnalyzePanel.css
git commit -m "feat(compose): add roving focus navigation and DTCG token binding"
```

---

### Task 5: Full QA Verification & Token Build

**Files:**
- Test: All test files under `tests/qa/features/`

- [ ] **Step 1: Run token build**

Run: `npm run build:tokens`
Expected: PASS and generated `dist/tokens/tokens.css`

- [ ] **Step 2: Run full compose vitest suite**

Run: `npx vitest run tests/qa/features/compose-*.test.ts`
Expected: PASS (25 test files passing)

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "chore(compose): verify Leximancy redesign against complete QA suite"
```
