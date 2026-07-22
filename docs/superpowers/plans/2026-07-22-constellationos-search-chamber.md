# ConstellationOS Search Chamber Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Nexus mastery archive UI with a cinematic ConstellationOS literary search chamber that morphs into a Phase-1 fixture result shell, routed at `/constellation`, with phenotype measure targets for visual guardrails.

**Architecture:** Single-scene React page. Idle = brand + beckoning search over a constellation backdrop. Submit (client-only) compresses search into a top rail and mounts a fixture-driven Phase-1 result shell. No live Leximancy/Rhyme engines in this plan. Old `/nexus` redirects. Phenotype orthogonality suite is re-run only if quantizers change (they should not).

**Tech Stack:** React, React Router (`createBrowserRouter`), Vitest + Testing Library, CSS custom properties, `usePrefersReducedMotion`, Lucide icons, existing Landing portal palette tokens as reference (not ComposeGalaxyBackdrop storm).

**Spec:** `docs/superpowers/specs/2026-07-22-constellationos-search-chamber-design.md`  
**Product PDR:** `docs/scholomance-encyclopedia/PDR-archive/Constellation-OS-PDR.md`  
**Guardrail:** `/__immune/phenotype` + `tests/visual/phenotype-orthogonality.spec.ts` (do not modify unless quantizers change)

## Global Constraints

- **Brand:** on-page hero is **ConstellationOS**; nav label is **Constellation**; route is `/constellation`.
- **No network on keystroke.** Fixture results only for v1 — `useConstellationPage` never `fetch`es.
- **Evidence before explanation:** null fixture fields render quiet awaiting states; invent no authoritative prose.
- **Reduced motion:** no starfield drift, no morph animation when `prefers-reduced-motion: reduce`.
- **Stable ids:** `#constellation-stage`, `#constellation-search`, `#constellation-result-shell`.
- **Delete mastery UI from this surface.** Do not render `NexusPanel` or `useProgression().nexus` on ConstellationOS.
- **VAELRIX Law 6 for fixture seeds:** fixture bytecode/seed values are constants — no `Math.random()` / `Date.now()` in page or fixture builders.
- **YAGNI packet:** v1 uses a slim `ConstellationPhase1Packet` shaped toward PDR §15, not the full `ConstellationOSPage` graph.

## File Structure

| File | Responsibility |
|---|---|
| `src/pages/Constellation/types.js` | JSDoc typedefs for Phase-1 packet |
| `src/pages/Constellation/fixtures/samplePagePacket.js` | Deterministic fixture for `the bright wound of morning` + awaiting fallback |
| `src/pages/Constellation/placeholders.js` | Static rotating literary placeholders |
| `src/hooks/useConstellationPage.js` | Query → packet (fixture only) |
| `src/pages/Constellation/ConstellationBackdrop.jsx` | Star field + sparse edges |
| `src/pages/Constellation/ConstellationSearch.jsx` | Labeled multiline search control |
| `src/pages/Constellation/ConstellationResultShell.jsx` | Phase-1 sections |
| `src/pages/Constellation/ConstellationPage.jsx` | Scene morph orchestration |
| `src/pages/Constellation/ConstellationPage.css` | Chamber styles + tokens |
| `src/lib/routes.js` | Lazy export + preload map |
| `src/main.jsx` | Route + redirect |
| `src/data/library.js` | Nav link |
| `src/components/Navigation/Navigation.jsx` | PRODUCTION_NAV_IDS + icon + ROUTE_COPY |
| Delete from route: `src/pages/Nexus/*`, `src/components/Nexus/*` | Removed from active UI |
| `tests/qa/features/constellation-page.test.jsx` | Chamber + submit behavior |
| `tests/qa/features/useConstellationPage.test.js` | Fixture hook |
| `tests/visual/constellation-chamber.spec.js` | Idle + submitted smoke |

---

### Task 1: Phase-1 fixture packet + hook

**Files:**
- Create: `src/pages/Constellation/types.js`
- Create: `src/pages/Constellation/fixtures/samplePagePacket.js`
- Create: `src/hooks/useConstellationPage.js`
- Test: `tests/qa/features/useConstellationPage.test.js`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `buildAwaitingPacket(rawQuery: string): ConstellationPhase1Packet`
  - `SAMPLE_BRIGHT_WOUND_PACKET: ConstellationPhase1Packet`
  - `useConstellationPage(query: string | null): { status: 'idle' \| 'ready'; packet: ConstellationPhase1Packet | null }`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/useConstellationPage.test.js`:

```js
import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useConstellationPage } from '../../../src/hooks/useConstellationPage.js';
import { SAMPLE_BRIGHT_WOUND_PACKET } from '../../../src/pages/Constellation/fixtures/samplePagePacket.js';

describe('useConstellationPage', () => {
  it('stays idle when query is null', () => {
    const { result } = renderHook(() => useConstellationPage(null));
    expect(result.current.status).toBe('idle');
    expect(result.current.packet).toBeNull();
  });

  it('returns the bright-wound fixture for that query (case-insensitive trim)', () => {
    const { result } = renderHook(() =>
      useConstellationPage('  The Bright Wound of Morning  '),
    );
    expect(result.current.status).toBe('ready');
    expect(result.current.packet.pageBytecode).toBe(SAMPLE_BRIGHT_WOUND_PACKET.pageBytecode);
    expect(result.current.packet.leximancy.status).toBe('ambiguous');
    expect(result.current.packet.leximancy.selectedInterpretationId).toBeNull();
  });

  it('returns an awaiting packet for unknown queries without inventing senses', () => {
    const { result } = renderHook(() => useConstellationPage('gravity'));
    expect(result.current.status).toBe('ready');
    expect(result.current.packet.query.raw).toBe('gravity');
    expect(result.current.packet.leximancy.status).toBe('unsupported');
    expect(result.current.packet.leximancy.interpretations).toEqual([]);
    expect(result.current.packet.rhymeAstrology).toBeNull();
    expect(result.current.packet.diagnostics.degradedChannels).toContain('leximancy');
  });

  it('is deterministic for the same query', () => {
    const a = renderHook(() => useConstellationPage('gravity'));
    const b = renderHook(() => useConstellationPage('gravity'));
    expect(a.result.current.packet).toEqual(b.result.current.packet);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/useConstellationPage.test.js`  
Expected: FAIL — cannot resolve `useConstellationPage`

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/Constellation/types.js`:

```js
/**
 * @typedef {'word'|'phrase'|'line'|'multiline'|'discovery'|'comparison'|'transformation'} ConstellationQueryKind
 */

/**
 * @typedef {object} ConstellationPhase1Packet
 * @property {1} version
 * @property {'scholomance/constellation-os-page-phase1'} schema_id
 * @property {string} pageBytecode
 * @property {{ raw: string, normalized: string, kind: ConstellationQueryKind, tokenCount: number, graphemeCount: number }} query
 * @property {{ status: 'resolved'|'ambiguous'|'unsupported', selectedInterpretationId: string|null, interpretations: Array<{ id: string, gloss: string, confidence: number }>, warnings: string[] }} leximancy
 * @property {{ phonemes: string[], stress: string, cadenceFamily: string, exactRhymes: string[], slantRhymes: string[] } | null} rhymeAstrology
 * @property {{ syllables: number, devicesHint: string[], schoolHint: string|null }} phraseGenome
 * @property {{ degradedChannels: string[], warnings: string[] }} diagnostics
 * @property {{ engineVersions: Record<string, string> }} provenance
 */
export {};
```

Create `src/pages/Constellation/fixtures/samplePagePacket.js`:

```js
/** @typedef {import('../types.js').ConstellationPhase1Packet} ConstellationPhase1Packet */

function normalizeQuery(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function countGraphemes(s) {
  return [...s].length;
}

function countTokens(normalized) {
  if (!normalized) return 0;
  return normalized.split(' ').filter(Boolean).length;
}

/**
 * @param {string} rawQuery
 * @returns {ConstellationPhase1Packet}
 */
export function buildAwaitingPacket(rawQuery) {
  const raw = String(rawQuery || '');
  const normalized = normalizeQuery(raw);
  return {
    version: 1,
    schema_id: 'scholomance/constellation-os-page-phase1',
    pageBytecode: `COS-PAGE-v1-AWAITING-${normalized || 'empty'}`,
    query: {
      raw,
      normalized,
      kind: normalized.includes(' ') ? 'phrase' : 'word',
      tokenCount: countTokens(normalized),
      graphemeCount: countGraphemes(normalized),
    },
    leximancy: {
      status: 'unsupported',
      selectedInterpretationId: null,
      interpretations: [],
      warnings: ['Leximancy constellation_atlas not wired in v1'],
    },
    rhymeAstrology: null,
    phraseGenome: {
      syllables: 0,
      devicesHint: [],
      schoolHint: null,
    },
    diagnostics: {
      degradedChannels: ['leximancy', 'rhymeAstrology'],
      warnings: ['Fixture awaiting-engine packet'],
    },
    provenance: {
      engineVersions: {
        constellationOS: 'phase1-fixture',
        leximancy: 'unwired',
        rhymeAstrology: 'unwired',
      },
    },
  };
}

/** Canonical literary fixture — ambiguity preserved (PDR §7.4). */
export const SAMPLE_BRIGHT_WOUND_PACKET = Object.freeze({
  version: 1,
  schema_id: 'scholomance/constellation-os-page-phase1',
  pageBytecode: 'COS-PAGE-v1-BRIGHT-WOUND-001',
  query: {
    raw: 'the bright wound of morning',
    normalized: 'the bright wound of morning',
    kind: 'phrase',
    tokenCount: 5,
    graphemeCount: 27,
  },
  leximancy: {
    status: 'ambiguous',
    selectedInterpretationId: null,
    interpretations: [
      { id: 'wound.injury', gloss: 'injury / opening in flesh', confidence: 0.52 },
      { id: 'wound.past', gloss: 'past tense of wind', confidence: 0.41 },
    ],
    warnings: ['Margin below selection threshold — ambiguity is data'],
  },
  rhymeAstrology: {
    phonemes: ['DH', 'AH0', 'B', 'R', 'AY1', 'T', 'W', 'UW1', 'N', 'D'],
    stress: 'x / x / x',
    cadenceFamily: 'iambic-adjacent',
    exactRhymes: ['mooring', 'warning'],
    slantRhymes: ['mourning'],
  },
  phraseGenome: {
    syllables: 7,
    devicesHint: ['metaphor-candidate'],
    schoolHint: 'PSYCHIC',
  },
  diagnostics: {
    degradedChannels: [],
    warnings: [],
  },
  provenance: {
    engineVersions: {
      constellationOS: 'phase1-fixture',
      leximancy: 'fixture-1',
      rhymeAstrology: 'fixture-1',
    },
  },
});

/**
 * @param {string} rawQuery
 * @returns {ConstellationPhase1Packet}
 */
export function resolveConstellationFixture(rawQuery) {
  const normalized = normalizeQuery(rawQuery);
  if (normalized === SAMPLE_BRIGHT_WOUND_PACKET.query.normalized) {
    return {
      ...SAMPLE_BRIGHT_WOUND_PACKET,
      query: { ...SAMPLE_BRIGHT_WOUND_PACKET.query, raw: String(rawQuery).trim() },
    };
  }
  return buildAwaitingPacket(rawQuery);
}
```

Create `src/hooks/useConstellationPage.js`:

```js
import { useMemo } from 'react';
import { resolveConstellationFixture } from '../pages/Constellation/fixtures/samplePagePacket.js';

/**
 * @param {string | null} query
 * @returns {{ status: 'idle' | 'ready', packet: import('../pages/Constellation/types.js').ConstellationPhase1Packet | null }}
 */
export function useConstellationPage(query) {
  return useMemo(() => {
    if (query == null || String(query).trim() === '') {
      return { status: 'idle', packet: null };
    }
    return { status: 'ready', packet: resolveConstellationFixture(query) };
  }, [query]);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/useConstellationPage.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/types.js \
  src/pages/Constellation/fixtures/samplePagePacket.js \
  src/hooks/useConstellationPage.js \
  tests/qa/features/useConstellationPage.test.js
git commit -m "$(cat <<'EOF'
feat(constellation): phase-1 fixture packet and page hook

EOF
)"
```

---

### Task 2: Routing, nav, and Nexus retirement

**Files:**
- Modify: `src/lib/routes.js`
- Modify: `src/main.jsx`
- Modify: `src/data/library.js`
- Modify: `src/components/Navigation/Navigation.jsx`
- Create: `src/pages/Constellation/ConstellationPage.jsx` (minimal stub for routing)
- Create: `src/pages/Constellation/ConstellationPage.css` (minimal)
- Delete from active use: `src/pages/Nexus/NexusPage.jsx`, `src/pages/Nexus/NexusPage.css`, `src/components/Nexus/NexusPanel.jsx`, `src/components/Nexus/NexusPanel.css`
- Test: `tests/qa/features/constellation-routing.test.jsx`

**Interfaces:**
- Consumes: Task 1 unused yet
- Produces: `/constellation` route element; `/nexus` → `/constellation` redirect; nav link `id: "constellation"`

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-routing.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom';
import React from 'react';
import { LINKS } from '../../../src/data/library.js';
import Navigation from '../../../src/components/Navigation/Navigation.jsx';
import { ThemeProvider } from '../../../src/hooks/useTheme.jsx';
import { AuthContext } from '../../../src/context/AuthContext.jsx';

vi.mock('../../../src/hooks/useAuth.jsx', () => ({
  useAuth: () => ({ user: null, isLoading: false, logout: vi.fn() }),
}));

function ConstellationStub() {
  return <div>ConstellationOS chamber</div>;
}

describe('Constellation routing + nav', () => {
  it('exposes a Constellation link to /constellation in library data', () => {
    const link = LINKS.find((l) => l.id === 'constellation');
    expect(link).toEqual({ id: 'constellation', path: '/constellation', label: 'Constellation' });
  });

  it('redirects /nexus to /constellation', () => {
    render(
      <MemoryRouter initialEntries={['/nexus']}>
        <Routes>
          <Route path="/nexus" element={<Navigate to="/constellation" replace />} />
          <Route path="/constellation" element={<ConstellationStub />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('ConstellationOS chamber')).toBeInTheDocument();
  });

  it('shows Constellation in the navigation rail copy map', () => {
    render(
      <ThemeProvider>
        <AuthContext.Provider value={{ user: null, isLoading: false, logout: vi.fn() }}>
          <MemoryRouter initialEntries={['/constellation']}>
            <Navigation />
            <Routes>
              <Route path="/constellation" element={<ConstellationStub />} />
            </Routes>
          </MemoryRouter>
        </AuthContext.Provider>
      </ThemeProvider>,
    );
    expect(screen.getAllByText('Constellation').length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-routing.test.jsx`  
Expected: FAIL — no constellation link in `LINKS`

- [ ] **Step 3: Write minimal implementation**

In `src/data/library.js`, add to `LINKS`:

```js
{ id: "constellation", path: "/constellation", label: "Constellation" },
```

In `src/components/Navigation/Navigation.jsx`:

```js
import { Eye, Headphones, BookOpen, Activity, Menu, ChevronRight, User, LogOut, Newspaper, Sparkles } from "lucide-react";

const PRODUCTION_NAV_IDS = Object.freeze([
  "watch", "listen", "read", "visualiser", "blog", "constellation",
]);

const ICON_MAP = {
  watch: Eye,
  listen: Headphones,
  read: BookOpen,
  visualiser: Activity,
  blog: Newspaper,
  constellation: Sparkles,
};

// inside ROUTE_COPY:
constellation: "Search the literary sky — meaning, sound, and constellation.",
```

In `src/lib/routes.js` replace Nexus export/map entry:

```js
export const ConstellationPage = lazyWithRetry(
  () => import("../pages/Constellation/ConstellationPage.jsx"),
  "constellation-page",
);
// remove NexusPage export
// in ALL_COMPONENTS:
"/constellation": ConstellationPage,
// remove "/nexus": NexusPage
```

Create stub `src/pages/Constellation/ConstellationPage.jsx`:

```jsx
import './ConstellationPage.css';

export default function ConstellationPage() {
  return (
    <div id="constellation-stage" className="constellation-stage" data-mode="idle">
      <h1 className="constellation-brand">ConstellationOS</h1>
    </div>
  );
}
```

Create minimal `src/pages/Constellation/ConstellationPage.css`:

```css
.constellation-stage {
  --cos-amethyst: #7b6cff;
  --cos-arc: #bfe3ff;
  --cos-gold: #d4af37;
  min-height: 100vh;
  color: var(--cos-arc);
  background: #07070e;
}
.constellation-brand {
  font-family: "Cinzel", "Palatino Linotype", Palatino, serif;
  letter-spacing: 0.08em;
}
```

In `src/main.jsx`:

```js
import { Navigate } from "react-router-dom";
// replace NexusPage import with ConstellationPage from ./lib/routes.js (same pattern as other pages)
import {
  // ...
  ConstellationPage,
  // remove NexusPage
} from "./lib/routes.js";

// routes:
{ path: "constellation", element: <ConstellationPage /> },
{ path: "nexus", element: <Navigate to="/constellation" replace /> },
```

Delete files:

```bash
git rm src/pages/Nexus/NexusPage.jsx src/pages/Nexus/NexusPage.css \
  src/components/Nexus/NexusPanel.jsx src/components/Nexus/NexusPanel.css
```

Fix any remaining imports of `NexusPage` (grep; Profile may keep progression nexus data — leave that).

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-routing.test.jsx`  
Expected: PASS

Also run: `rg -n "NexusPage|NexusPanel|pages/Nexus" src/`  
Expected: no active page imports (progression/registry mentions of "nexus" mastery data are OK)

- [ ] **Step 5: Commit**

```bash
git add src/data/library.js src/components/Navigation/Navigation.jsx \
  src/lib/routes.js src/main.jsx \
  src/pages/Constellation/ConstellationPage.jsx \
  src/pages/Constellation/ConstellationPage.css \
  tests/qa/features/constellation-routing.test.jsx
git commit -m "$(cat <<'EOF'
feat(constellation): route /constellation, nav link, retire Nexus UI

EOF
)"
```

---

### Task 3: Constellation backdrop

**Files:**
- Create: `src/pages/Constellation/ConstellationBackdrop.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Modify: `src/pages/Constellation/ConstellationPage.jsx`
- Test: extend `tests/qa/features/constellation-page.test.jsx` (create)

**Interfaces:**
- Consumes: `usePrefersReducedMotion(): boolean`
- Produces: `<ConstellationBackdrop reducedMotion={boolean} />` — decorative `aria-hidden` canvas/SVG of stars + edges; deterministic star positions (seeded constant array, not `Math.random`)

- [ ] **Step 1: Write the failing test**

Create `tests/qa/features/constellation-page.test.jsx`:

```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import ConstellationPage from '../../../src/pages/Constellation/ConstellationPage.jsx';

vi.mock('../../../src/hooks/usePrefersReducedMotion.js', () => ({
  usePrefersReducedMotion: () => true,
}));

describe('ConstellationPage chamber', () => {
  it('renders constellation backdrop and brand', () => {
    render(
      <MemoryRouter>
        <ConstellationPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'ConstellationOS' })).toBeInTheDocument();
    expect(document.getElementById('constellation-backdrop')).toBeTruthy();
    expect(document.getElementById('constellation-backdrop').getAttribute('aria-hidden')).toBe('true');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: FAIL — missing `#constellation-backdrop`

- [ ] **Step 3: Write minimal implementation**

Create `src/pages/Constellation/ConstellationBackdrop.jsx` with a frozen array of ~40 `{x,y,r}` star positions (0–100 percentages) and ~12 edge pairs by index. Render SVG full-bleed. When `reducedMotion` is false, CSS class `constellation-backdrop--drift` enables a slow transform animation; when true, omit the class.

Wire into `ConstellationPage`:

```jsx
import ConstellationBackdrop from './ConstellationBackdrop.jsx';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';

export default function ConstellationPage() {
  const reducedMotion = usePrefersReducedMotion();
  return (
    <div id="constellation-stage" className="constellation-stage" data-mode="idle">
      <ConstellationBackdrop reducedMotion={reducedMotion} />
      <div className="constellation-foreground">
        <h1 className="constellation-brand">ConstellationOS</h1>
      </div>
    </div>
  );
}
```

CSS: void radial gradients (Landing-adjacent), SVG stars as soft white/arc dots, edges at ~0.15 opacity amethyst.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/ConstellationBackdrop.jsx \
  src/pages/Constellation/ConstellationPage.jsx \
  src/pages/Constellation/ConstellationPage.css \
  tests/qa/features/constellation-page.test.jsx
git commit -m "$(cat <<'EOF'
feat(constellation): deterministic constellation backdrop

EOF
)"
```

---

### Task 4: Beckoning search control

**Files:**
- Create: `src/pages/Constellation/placeholders.js`
- Create: `src/pages/Constellation/ConstellationSearch.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Modify: `tests/qa/features/constellation-page.test.jsx`

**Interfaces:**
- Consumes: `onSubmit(query: string): void`, `mode: 'idle' | 'submitted'`, `defaultValue?: string`
- Produces: `#constellation-search` root wrapping labeled textarea; empty submit calls `onEmptySubmit` or no-ops with live region refusal

- [ ] **Step 1: Extend failing tests**

Add to `tests/qa/features/constellation-page.test.jsx`:

```jsx
import userEvent from '@testing-library/user-event';

it('exposes an accessible search label and stable search id', () => {
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  expect(screen.getByLabelText(/search the literary sky/i)).toBeInTheDocument();
  expect(document.getElementById('constellation-search')).toBeTruthy();
});

it('refuses empty submit and stays idle', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  await user.click(screen.getByRole('button', { name: /search/i }));
  expect(screen.getByRole('status')).toHaveTextContent(/enter a word, phrase, or line/i);
  expect(document.getElementById('constellation-stage').dataset.mode).toBe('idle');
  expect(document.getElementById('constellation-result-shell')).toBeNull();
});

it('submits a query and mounts the result shell', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  const field = screen.getByLabelText(/search the literary sky/i);
  await user.type(field, 'the bright wound of morning');
  await user.keyboard('{Enter}');
  expect(document.getElementById('constellation-stage').dataset.mode).toBe('submitted');
  expect(document.getElementById('constellation-result-shell')).toBeTruthy();
  expect(screen.getByRole('heading', { name: /phrase identity/i })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run tests to verify new cases fail**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: FAIL on missing search label / result shell

- [ ] **Step 3: Implement search + page state**

`placeholders.js` — frozen array of 5–8 literary strings from the spec/PDR examples.

`ConstellationSearch.jsx` — textarea + visually present label + subdued submit button (`aria-label="Search"`). Rotate placeholder with `setInterval` only when `!reducedMotion` and mode is idle; otherwise fixed first placeholder. Never fetch.

`ConstellationPage.jsx` — `useState` for `submittedQuery` (`null` idle). On submit set query; render invitation line under brand when idle: `Ask the sky what language remembers.` On submitted mode, compress brand+search via CSS class `constellation-stage--submitted`.

For Task 4, result shell can be a temporary stub:

```jsx
{submittedQuery != null && (
  <div id="constellation-result-shell">
    <h2>Phrase Identity</h2>
  </div>
)}
```

(Full sections in Task 5.)

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: PASS for empty refuse + submit mounts shell (Phrase Identity heading present)

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/placeholders.js \
  src/pages/Constellation/ConstellationSearch.jsx \
  src/pages/Constellation/ConstellationPage.jsx \
  src/pages/Constellation/ConstellationPage.css \
  tests/qa/features/constellation-page.test.jsx
git commit -m "$(cat <<'EOF'
feat(constellation): beckoning literary search with idle refusal

EOF
)"
```

---

### Task 5: Phase-1 result shell

**Files:**
- Create: `src/pages/Constellation/ConstellationResultShell.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.jsx`
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Modify: `tests/qa/features/constellation-page.test.jsx`

**Interfaces:**
- Consumes: `packet: ConstellationPhase1Packet` from `useConstellationPage(submittedQuery)`
- Produces: sections Phrase Identity, Leximancy Meaning Field, Rhyme Constellation, Phrase Genome

- [ ] **Step 1: Write failing assertions**

Add:

```jsx
it('renders ambiguous interpretations for the bright-wound fixture', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  await user.type(screen.getByLabelText(/search the literary sky/i), 'the bright wound of morning');
  await user.keyboard('{Enter}');
  expect(screen.getByText(/injury \/ opening in flesh/i)).toBeInTheDocument();
  expect(screen.getByText(/past tense of wind/i)).toBeInTheDocument();
  expect(screen.getByText(/ambiguity is data|margin below/i)).toBeInTheDocument();
});

it('shows awaiting state for unwired rhyme on unknown queries', async () => {
  const user = userEvent.setup();
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  await user.type(screen.getByLabelText(/search the literary sky/i), 'gravity');
  await user.keyboard('{Enter}');
  expect(screen.getByText(/awaiting engine/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: FAIL — gloss text missing

- [ ] **Step 3: Implement ResultShell**

`ConstellationResultShell.jsx` structure:

```jsx
export default function ConstellationResultShell({ packet }) {
  return (
    <div id="constellation-result-shell" className="constellation-result-shell">
      <section aria-labelledby="cos-phrase-identity">
        <h2 id="cos-phrase-identity">Phrase Identity</h2>
        {/* raw, normalized, kind, tokenCount, graphemeCount, pageBytecode, engine versions */}
      </section>
      <section aria-labelledby="cos-leximancy">
        <h2 id="cos-leximancy">Leximancy Meaning Field</h2>
        {/* interpretations list OR awaiting */}
      </section>
      <section aria-labelledby="cos-rhyme">
        <h2 id="cos-rhyme">Rhyme Constellation</h2>
        {/* table of phonemes/stress/rhymes OR awaiting; optional SVG stub from phonemes length */}
      </section>
      <section aria-labelledby="cos-genome">
        <h2 id="cos-genome">Phrase Genome</h2>
        {/* syllables, devicesHint, schoolHint OR awaiting */}
      </section>
    </div>
  );
}
```

Rules:
- If `leximancy.interpretations.length === 0`, show “Awaiting engine — Leximancy”
- If `rhymeAstrology == null`, show “Awaiting engine — Rhyme Astrology”
- Never invent glosses

Wire: `const { packet } = useConstellationPage(submittedQuery);` and pass packet when ready.

Rail re-search: submitting a new query from submitted mode replaces `submittedQuery`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/qa/features/useConstellationPage.test.js tests/qa/features/constellation-page.test.jsx tests/qa/features/constellation-routing.test.jsx`  
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/ConstellationResultShell.jsx \
  src/pages/Constellation/ConstellationPage.jsx \
  src/pages/Constellation/ConstellationPage.css \
  tests/qa/features/constellation-page.test.jsx
git commit -m "$(cat <<'EOF'
feat(constellation): phase-1 fixture result shell sections

EOF
)"
```

---

### Task 6: Cinematic morph CSS + reduced motion

**Files:**
- Modify: `src/pages/Constellation/ConstellationPage.css`
- Modify: `tests/qa/features/constellation-page.test.jsx`

**Interfaces:**
- Consumes: `data-mode` on `#constellation-stage`; `prefers-reduced-motion` class on stage when reduced
- Produces: idle centered composition; submitted rail layout; morph transitions gated by `.constellation-stage--animate`

- [ ] **Step 1: Write failing test**

```jsx
it('disables morph animation class when reduced motion is preferred', () => {
  // mock already returns true
  render(<MemoryRouter><ConstellationPage /></MemoryRouter>);
  expect(document.getElementById('constellation-stage').classList.contains('constellation-stage--animate')).toBe(false);
});
```

Add a second file describe block or unmock test only if easy; otherwise verify class absence under current mock and document that animate class is added only when `reducedMotion === false`.

- [ ] **Step 2: Run to verify fail/pass appropriately** then implement CSS

Idle: brand + invitation + search vertically centered.  
Submitted: search+brand sticky top rail (~4–5rem), result shell scrolls beneath.  
Transitions: `transform`/`opacity` 320ms ease-in-out only under `--animate`.  
No card grids; section rhythm via spacing and hairline rules.

- [ ] **Step 3: Run tests**

Run: `npx vitest run tests/qa/features/constellation-page.test.jsx`  
Expected: PASS

- [ ] **Step 4: Manual check**

Run: `npm run dev` → open `http://localhost:5173/constellation`  
Verify: constellation field, beckoning search, submit morph, `/nexus` redirects.

- [ ] **Step 5: Commit**

```bash
git add src/pages/Constellation/ConstellationPage.css \
  src/pages/Constellation/ConstellationPage.jsx \
  tests/qa/features/constellation-page.test.jsx
git commit -m "$(cat <<'EOF'
feat(constellation): idle-to-rail morph with reduced-motion path

EOF
)"
```

---

### Task 7: Visual smoke + phenotype guardrail note

**Files:**
- Create: `tests/visual/constellation-chamber.spec.js`
- Optional note in plan progress only — do not change phenotype quantizers

**Interfaces:**
- Consumes: running Vite (Playwright project config as other visual specs)
- Produces: smoke that idle and submitted states expose measure ids

- [ ] **Step 1: Write Playwright smoke**

```js
import { test, expect } from '@playwright/test';

test.describe('ConstellationOS chamber smoke', () => {
  test('idle exposes brand and search measure target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/constellation');
    await expect(page.getByRole('heading', { name: 'ConstellationOS' })).toBeVisible();
    await expect(page.locator('#constellation-search')).toBeVisible();
    await expect(page.locator('#constellation-result-shell')).toHaveCount(0);
  });

  test('submit mounts result shell measure target', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/constellation');
    await page.getByLabel(/search the literary sky/i).fill('the bright wound of morning');
    await page.getByLabel(/search the literary sky/i).press('Enter');
    await expect(page.locator('#constellation-stage')).toHaveAttribute('data-mode', 'submitted');
    await expect(page.locator('#constellation-result-shell')).toBeVisible();
    await expect(page.getByRole('heading', { name: /phrase identity/i })).toBeVisible();
  });
});
```

- [ ] **Step 2: Run smoke**

Run: `npx playwright test tests/visual/constellation-chamber.spec.js --project=chromium`  
Expected: PASS (with local webServer config)

- [ ] **Step 3: Confirm phenotype matrix untouched**

Run: `npx playwright test tests/visual/phenotype-orthogonality.spec.ts --project=chromium`  
Expected: PASS (no quantizer edits in this plan)

**Guardrail practice for future CSS tweaks (not automated in this task):** declare intended axis → optional `/__immune/phenotype` probe → before/after on `#constellation-search` / `#constellation-result-shell` → reject unexpected block flips.

- [ ] **Step 4: Commit**

```bash
git add tests/visual/constellation-chamber.spec.js
git commit -m "$(cat <<'EOF'
test(constellation): chamber idle and submitted visual smoke

EOF
)"
```

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Single-scene morph | 4–6 |
| Brand ConstellationOS | 2–4 |
| Route `/constellation`, `/nexus` redirect | 2 |
| Nav label Constellation | 2 |
| Constellation backdrop | 3 |
| Beckoning search, no network until submit | 4 |
| Empty refusal | 4 |
| Phase-1 result shell + fixture | 1, 5 |
| Ambiguity is data / awaiting states | 1, 5 |
| Reduced motion | 3, 6 |
| Stable measure ids | 4–7 |
| Retire Nexus mastery UI | 2 |
| Phenotype matrix still green | 7 |
| Phenotype coding loop | documented in Task 7 (manual practice; Plan 2 seals later) |

## Placeholder scan

No TBD/TODO steps. Fixture is explicitly slim Phase-1, not full PDR §15 graph.

## Type consistency

- `useConstellationPage(query)` → `{ status, packet }` used by Task 5
- `ConstellationPhase1Packet` fields match ResultShell reads
- Dom ids match smoke tests and spec §4
