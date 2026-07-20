# Scholomance Update Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a curated Scholomance Update Ledger to the landing twin-gate (portal left, ledger right), built from shared DivWand structure + Wand tokens, with an atomic prompt script for new entries.

**Architecture:** Mechanically extract `DivLayoutRenderer` + shared DivWand variant CSS and Wand voice tokens into `src/features/`. Landing consumes a fixed DivWand proposal (existing schema — no new `slot` type) with role-based slot injection for title/content. Ledger data is imported as `?raw` JSON and parsed defensively. A pure helper + readline CLI prepends entries atomically.

**Tech Stack:** React (Vite), Vitest + Testing Library, Playwright, Framer Motion (existing), Node ESM scripts, existing `validateDivProposal` in `codex/core/modulation/planner/div-layout-validator.js`.

**Spec:** `docs/superpowers/specs/2026-07-19-scholomance-update-ledger-design.md`

## Global Constraints

- Import ledger JSON as `?raw` and parse via `parseLedgerEntries`; never `import … from "*.json"` as a module object.
- Missing tracked `src/data/update-ledger.json` = build failure; malformed content = empty-state chronicle.
- UI preserves file order; display at most 30 valid entries; do not re-sort by date.
- Shell proposal must pass existing `validateDivProposal` (types: `container|element|voxel|world`; roles from the validator allowlist; style variants: `glassmorphic|neonBorder|obsidianPanel|solid|transparent`).
- Slot binding: when `DivLayoutRenderer` receives `slots`, inject `slots.title` into the first `role === "header"` node and `slots.content` into the first `role === "content"` node. Do **not** add a `slot` type or `props.slot` (validator rejects unknown props).
- `validateDivProposal` returns `{ valid, ok, errors }` — there is no `.value`; on success use the proposal object itself.
- Do not import `DivWandPage.css` or `WandPage.css` into Landing; use shared feature CSS only.
- Dissolve wraps the portal orb only; ledger has no navigation / no `onClick` enter.
- Extraction is mechanical — no DivWand schema redesign.
- Authoring script fails closed on corrupt JSON; UI may skip bad rows, script must not rewrite them away.
- Symmetry matches outer gate footprints, not identical internal shapes.
- Entry base CSS: `opacity: 1; transform: none` — motion never required for visibility.
- Vitest for semantics; Playwright for twin-gate geometry.

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/features/divwand/DivLayoutRenderer.jsx` | Extracted layout tree renderer (+ optional slots) |
| `src/features/divwand/validateDivProposal.js` | Re-export core validator for feature consumers |
| `src/features/divwand/divProposalSchema.js` | JSDoc / constants documenting allowed types/roles/variants |
| `src/features/divwand/divwand-shared.css` | `.div-node`, variants, glow, interactive (shared) |
| `src/features/wand/wand-tokens.css` | Shared voice tokens for title/quiet/summary |
| `src/data/update-ledger.json` | Curated entries (newest first) |
| `src/pages/Landing/updateLedgerModel.js` | `isValidLedgerEntry`, `parseLedgerEntries` |
| `src/pages/Landing/updateLedgerShellProposal.js` | Primary + SAFE proposals; validated once at module load |
| `src/pages/Landing/UpdateLedgerWindow.jsx` | Region + DivLayoutRenderer + entries |
| `src/pages/Landing/UpdateLedgerWindow.css` | Ledger chrome/motion (uses wand tokens) |
| `src/pages/Landing/LandingPage.jsx` | Twin-gate composition |
| `src/pages/Landing/LandingPage.css` | Gate grid / responsive stack |
| `src/pages/DivWand/DivWandPage.jsx` | Import shared renderer; remove inline `LayoutNode` |
| `src/pages/DivWand/DivWandPage.css` | `@import` shared CSS; keep page-only studio chrome |
| `scripts/lib/update-ledger-entry.js` | Pure create/prepend/serialize/validate |
| `scripts/add-update-ledger-entry.mjs` | readline CLI + atomic write |
| `tests/features/divwand/DivLayoutRenderer.test.jsx` | Renderer + slots |
| `tests/pages/Landing/updateLedgerModel.test.js` | Parse/filter |
| `tests/scripts/add-update-ledger-entry.test.js` | Pure helpers |
| `tests/pages/Landing/UpdateLedgerWindow.test.jsx` | Component semantics |
| `tests/pages/Landing/LandingPage.test.jsx` | Twin-gate smoke |
| `tests/qa/e2e/landing-twin-gate.spec.js` | Browser geometry + enter path |

---

### Task 1: Extract DivLayoutRenderer + shared CSS (mechanical)

**Files:**
- Create: `src/features/divwand/DivLayoutRenderer.jsx`
- Create: `src/features/divwand/validateDivProposal.js`
- Create: `src/features/divwand/divProposalSchema.js`
- Create: `src/features/divwand/divwand-shared.css`
- Modify: `src/pages/DivWand/DivWandPage.jsx` (delete inline `LayoutNode`; import shared)
- Modify: `src/pages/DivWand/DivWandPage.css` (import shared; remove moved rules)
- Test: `tests/features/divwand/DivLayoutRenderer.test.jsx`
- Test: `tests/qa/modulation/div-layout.test.js` (must still pass unchanged)

**Interfaces:**
- Consumes: existing DivWand node tree shape from `proposedLayout`
- Produces:
  - `DivLayoutRenderer({ proposal, slots?, isInspectorActive?, hoveredId?, onHover?, onLeave? })`
  - `validateDivProposal(proposal) → { valid, ok, errors, … }`

- [ ] **Step 1: Write the failing renderer test**

```jsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DivLayoutRenderer } from '../../../src/features/divwand/DivLayoutRenderer.jsx';

afterEach(cleanup);

const proposal = {
  rationale: 'test',
  confidence: 1,
  reviewRequired: false,
  proposedLayout: {
    id: 'root',
    type: 'container',
    role: 'card',
    style: { variant: 'glassmorphic' },
    layout: { display: 'flex', flexDirection: 'column', width: 200, height: 200 },
    children: [
      { id: 'hdr', type: 'container', role: 'header', layout: { height: 40 }, children: [] },
      { id: 'body', type: 'container', role: 'content', layout: { flex: undefined, height: 120 }, children: [] },
    ],
  },
};

describe('DivLayoutRenderer', () => {
  it('renders layout nodes by id', () => {
    render(<DivLayoutRenderer proposal={proposal} />);
    expect(document.getElementById('root')).toBeTruthy();
    expect(document.getElementById('hdr')).toBeTruthy();
  });

  it('injects slots into header/content roles', () => {
    render(
      <DivLayoutRenderer
        proposal={proposal}
        slots={{
          title: <h2>Scholomance Update Ledger</h2>,
          content: <p>Chronicle body</p>,
        }}
      />
    );
    expect(screen.getByRole('heading', { name: 'Scholomance Update Ledger' })).toBeTruthy();
    expect(screen.getByText('Chronicle body')).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/divwand/DivLayoutRenderer.test.jsx`  
Expected: FAIL (module not found)

- [ ] **Step 3: Move CSS variants into shared file**

Create `src/features/divwand/divwand-shared.css` containing (cut from `DivWandPage.css`, keep selectors identical):

- `.div-node` (if defined in page CSS)
- `.variant-glassmorphic`, `.variant-neonBorder`, `.variant-obsidianPanel`, `.variant-solid`, `.variant-transparent`
- `.div-glow-*`
- `.div-interactive` (+ hover)
- `.div-elem-text`, `.div-elem-title`, `.div-elem-subtitle`, `.div-elem-badge`, `.div-elem-button`, `.div-elem-glow-container` (element chrome used by renderer)

At top of `DivWandPage.css`:

```css
@import "../../features/divwand/divwand-shared.css";
```

Remove the duplicated rules from the page file. Leave studio chrome (`.dw-container`, header, panes) in the page CSS.

- [ ] **Step 4: Implement DivLayoutRenderer**

Move `LayoutNode` + `snapPx` helpers from `DivWandPage.jsx` into `DivLayoutRenderer.jsx`. Export:

```jsx
export function DivLayoutRenderer({
  proposal,
  slots = null,
  isInspectorActive = false,
  hoveredId = null,
  onHover = () => {},
  onLeave = () => {},
}) {
  const root = proposal?.proposedLayout;
  const rootRef = useRef(null);
  if (!root) return null;
  return (
    <div ref={rootRef} className="div-layout-root" style={{ width: '100%', height: '100%', position: 'relative' }}>
      <LayoutNode
        node={root}
        depth={0}
        isInspectorActive={isInspectorActive}
        hoveredId={hoveredId}
        onHover={onHover}
        onLeave={onLeave}
        rootRef={rootRef}
        slots={slots}
      />
    </div>
  );
}
```

In `LayoutNode`, after computing `sharedProps`, when rendering a container:

```jsx
const slotChild =
  slots && node.role === 'header' ? slots.title :
  slots && node.role === 'content' ? slots.content :
  null;

return (
  <div {...sharedProps}>
    {slotChild}
    {node.children?.map((child) => (
      <LayoutNode key={child.id} /* …pass slots… */ />
    ))}
  </div>
);
```

Keep voxel/world/element branches identical. Import `Sparkles` from `lucide-react` for glow-container. Import `./divwand-shared.css` from the renderer file.

- [ ] **Step 5: Create validate + schema shims**

`validateDivProposal.js`:

```js
export { validateDivProposal, validateDivLayout, MAX_LAYOUT_DEPTH, MAX_SERIALIZED_BYTES } from '../../../codex/core/modulation/planner/div-layout-validator.js';
```

`divProposalSchema.js` — export documented constants only (no behavior change):

```js
export const DIV_NODE_TYPES = ['container', 'element', 'voxel', 'world'];
export const DIV_ROLES = [/* copy allowlist from validator */];
export const DIV_STYLE_VARIANTS = ['glassmorphic', 'neonBorder', 'obsidianPanel', 'solid', 'transparent'];
```

- [ ] **Step 6: Rewire DivWandPage**

Remove inline `LayoutNode` / `snapPx`. Import `{ DivLayoutRenderer } from '../../features/divwand/DivLayoutRenderer.jsx'`. Replace preview tree with:

```jsx
<DivLayoutRenderer
  proposal={activeProposal}
  isInspectorActive={isInspectorActive}
  hoveredId={hoveredNodeInfo?.id ?? null}
  onHover={/* existing hover handler */}
  onLeave={/* existing leave handler */}
/>
```

Preserve inspector behavior. Do not change presets or validation call sites (`validateDivProposal` from `engine.adapter` may remain).

- [ ] **Step 7: Run tests**

Run:

```bash
npx vitest run tests/features/divwand/DivLayoutRenderer.test.jsx tests/qa/modulation/div-layout.test.js
```

Expected: PASS

Manual smoke (optional): open `/div-wand`, load Alchemist Card preset — preview still renders.

- [ ] **Step 8: Commit**

```bash
git add src/features/divwand src/pages/DivWand/DivWandPage.jsx src/pages/DivWand/DivWandPage.css tests/features/divwand/DivLayoutRenderer.test.jsx
git commit -m "$(cat <<'EOF'
refactor(divwand): extract shared DivLayoutRenderer

Move layout rendering and variant CSS into src/features/divwand for Landing/Combat reuse without page CSS leakage.
EOF
)"
```

---

### Task 2: Extract Wand voice tokens

**Files:**
- Create: `src/features/wand/wand-tokens.css`
- Modify: `src/pages/Wand/WandPage.css` (consume tokens where gold/glow already appear — light touch only)
- Test: `tests/features/wand/wand-tokens.test.js` (assert file exports expected custom properties via fs read)

**Interfaces:**
- Produces: CSS custom properties `--wand-amethyst-rgb`, `--wand-arc-blue-rgb`, `--wand-gold-rgb`, `--wand-title-glow`, `--wand-quiet-text`, `--wand-summary-text`

- [ ] **Step 1: Write the failing token presence test**

```js
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('wand-tokens.css', () => {
  it('defines shared voice tokens', () => {
    const css = readFileSync(new URL('../../../src/features/wand/wand-tokens.css', import.meta.url), 'utf8');
    for (const token of [
      '--wand-amethyst-rgb',
      '--wand-arc-blue-rgb',
      '--wand-gold-rgb',
      '--wand-title-glow',
      '--wand-quiet-text',
      '--wand-summary-text',
    ]) {
      expect(css).toContain(token);
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/features/wand/wand-tokens.test.js`  
Expected: FAIL (ENOENT)

- [ ] **Step 3: Add tokens file**

```css
/* src/features/wand/wand-tokens.css */
:root {
  --wand-amethyst-rgb: 150 103 255;
  --wand-arc-blue-rgb: 77 190 255;
  --wand-gold-rgb: 228 190 104;
  --wand-title-glow:
    0 0 12px rgb(var(--wand-amethyst-rgb) / 0.34),
    0 0 26px rgb(var(--wand-arc-blue-rgb) / 0.15);
  --wand-quiet-text: rgb(213 214 231 / 0.68);
  --wand-summary-text: rgb(226 226 239 / 0.82);
}
```

At top of `WandPage.css`:

```css
@import "../../features/wand/wand-tokens.css";
```

Do **not** rewrite the Wand studio; only import tokens so Landing and Wand share the vocabulary.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/features/wand/wand-tokens.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/wand/wand-tokens.css src/pages/Wand/WandPage.css tests/features/wand/wand-tokens.test.js
git commit -m "$(cat <<'EOF'
feat(wand): extract shared voice tokens

Add wand-tokens.css so Landing ledger typography can share Wand chrome without importing WandPage.css.
EOF
)"
```

---

### Task 3: Ledger data model + curated JSON

**Files:**
- Create: `src/data/update-ledger.json`
- Create: `src/pages/Landing/updateLedgerModel.js`
- Test: `tests/pages/Landing/updateLedgerModel.test.js`

**Interfaces:**
- Produces:
  - `isValidLedgerEntry(value: unknown) → boolean`
  - `parseLedgerEntries(source: string, limit = 30) → LedgerEntry[]`
  - `LedgerEntry = { id: string, date: string, title: string, summary: string }`

- [ ] **Step 1: Write the failing tests**

```js
import { describe, expect, it } from 'vitest';
import { isValidLedgerEntry, parseLedgerEntries } from '../../../src/pages/Landing/updateLedgerModel.js';

describe('updateLedgerModel', () => {
  it('accepts a well-formed entry', () => {
    expect(isValidLedgerEntry({
      id: '2026-07-19-example',
      date: '2026-07-19',
      title: 'Example',
      summary: 'A short summary that explains the change.',
    })).toBe(true);
  });

  it('rejects bad dates and empty fields', () => {
    expect(isValidLedgerEntry({ id: 'x', date: '07-19-2026', title: 'T', summary: 'S' })).toBe(false);
    expect(isValidLedgerEntry({ id: '', date: '2026-07-19', title: 'T', summary: 'S' })).toBe(false);
  });

  it('parses malformed JSON to empty array', () => {
    expect(parseLedgerEntries('{')).toEqual([]);
  });

  it('filters invalid rows, preserves order, caps at 30', () => {
    const rows = Array.from({ length: 35 }, (_, i) => ({
      id: `2026-07-19-item-${i}`,
      date: '2026-07-19',
      title: `Title ${i}`,
      summary: `Summary for item ${i}`,
    }));
    rows.splice(1, 0, { id: 'bad', date: 'nope', title: 'x', summary: 'y' });
    const source = JSON.stringify(rows);
    const parsed = parseLedgerEntries(source, 30);
    expect(parsed).toHaveLength(30);
    expect(parsed[0].id).toBe('2026-07-19-item-0');
    expect(parsed.every((e) => e.id !== 'bad')).toBe(true);
  });

  it('returns empty for non-array JSON', () => {
    expect(parseLedgerEntries('{"id":"x"}')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Landing/updateLedgerModel.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement model + seed JSON**

`updateLedgerModel.js` — implement exactly as in the spec (`ISO_DATE_PATTERN`, `isValidLedgerEntry`, `parseLedgerEntries` with try/catch → `[]`).

`src/data/update-ledger.json` — start with `[]` or 1–3 real curated seed entries from recent work (newest first). Valid JSON array required so Vite can resolve the asset.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/pages/Landing/updateLedgerModel.test.js`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/data/update-ledger.json src/pages/Landing/updateLedgerModel.js tests/pages/Landing/updateLedgerModel.test.js
git commit -m "$(cat <<'EOF'
feat(landing): add update ledger data model

Parse curated ledger JSON defensively with file-order preservation and a 30-entry display cap.
EOF
)"
```

---

### Task 4: Curation script (pure helpers + CLI)

**Files:**
- Create: `scripts/lib/update-ledger-entry.js`
- Create: `scripts/add-update-ledger-entry.mjs`
- Modify: `package.json` (add `"ledger:add"`)
- Test: `tests/scripts/add-update-ledger-entry.test.js`

**Interfaces:**
- Produces:
  - `createLedgerEntry({ title, summary, date }) → { ok: true, entry } | { ok: false, error }`
  - `prependLedgerEntry({ existingEntries, entry }) → { ok: true, entries } | { ok: false, error }`
  - `serializeLedger(entries) → string` (JSON pretty + trailing newline)
  - `parseExistingLedger(source) → { ok: true, entries } | { ok: false, error }` — **fail closed** if not a JSON array (do not strip invalid rows)

- [ ] **Step 1: Write the failing helper tests**

```js
import { describe, expect, it } from 'vitest';
import {
  createLedgerEntry,
  prependLedgerEntry,
  serializeLedger,
  parseExistingLedger,
} from '../../scripts/lib/update-ledger-entry.js';

describe('update-ledger-entry helpers', () => {
  it('creates a dated slug id', () => {
    const result = createLedgerEntry({
      title: 'CODEx Metrics meet Song Stats',
      summary: 'The Read page Metrics panel now draws from the Song Stats engine for one chronicle.',
      date: '2026-07-19',
    });
    expect(result.ok).toBe(true);
    expect(result.entry.id).toBe('2026-07-19-codex-metrics-meet-song-stats');
  });

  it('rejects short title / short summary / bad date', () => {
    expect(createLedgerEntry({ title: 'ab', summary: 'long enough summary text here!!', date: '2026-07-19' }).ok).toBe(false);
    expect(createLedgerEntry({ title: 'Valid Title', summary: 'too short', date: '2026-07-19' }).ok).toBe(false);
    expect(createLedgerEntry({ title: 'Valid Title', summary: 'long enough summary text here!!', date: '2026-13-40' }).ok).toBe(false);
  });

  it('prepends and rejects duplicate ids', () => {
    const a = createLedgerEntry({
      title: 'First Entry Title',
      summary: 'A summary that is definitely long enough for rules.',
      date: '2026-07-19',
    }).entry;
    const b = createLedgerEntry({
      title: 'Second Entry Title',
      summary: 'Another summary that is definitely long enough here.',
      date: '2026-07-18',
    }).entry;
    const once = prependLedgerEntry({ existingEntries: [a], entry: b });
    expect(once.ok).toBe(true);
    expect(once.entries[0].id).toBe(b.id);
    const dup = prependLedgerEntry({ existingEntries: once.entries, entry: b });
    expect(dup.ok).toBe(false);
  });

  it('parseExistingLedger fails closed on corrupt JSON', () => {
    expect(parseExistingLedger('{').ok).toBe(false);
    expect(parseExistingLedger('{"no":"array"}').ok).toBe(false);
  });

  it('serializeLedger ends with one newline', () => {
    const text = serializeLedger([]);
    expect(text.endsWith('\n')).toBe(true);
    expect(text.endsWith('\n\n')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/scripts/add-update-ledger-entry.test.js`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement pure helpers**

Validation table (script):

| Field | Rule |
|-------|------|
| title | trim, length 3–100 |
| summary | trim, length 20–500 |
| date | `YYYY-MM-DD` and `Date` calendar-valid |
| id | `${date}-${slug(title)}` slug: lowercase, non-alnum → `-`, collapse dashes |
| duplicate id | reject |

`parseExistingLedger`: `JSON.parse`; require `Array.isArray`; on success return entries **as-is** (including any odd objects — do not filter). Corrupt → `{ ok: false, error }`.

- [ ] **Step 4: Implement CLI**

`scripts/add-update-ledger-entry.mjs`:

1. Parse `--date YYYY-MM-DD` from `process.argv` (optional).
2. `readline/promises` prompt for title + summary (and date if flag absent — default today UTC or local ISO date; prefer local `YYYY-MM-DD`).
3. `createLedgerEntry` → fail → `console.error` + `process.exit(1)`.
4. Read `src/data/update-ledger.json` utf8.
5. `parseExistingLedger` → fail → exit 1 **without writing**.
6. `prependLedgerEntry` → fail on duplicate → exit 1.
7. `serializeLedger` → write `${path}.tmp` → `rename` to destination.
8. On write error: try `unlink` temp; exit 1; never leave partial destination.

Add to `package.json` scripts:

```json
"ledger:add": "node scripts/add-update-ledger-entry.mjs"
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/scripts/add-update-ledger-entry.test.js`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add scripts/lib/update-ledger-entry.js scripts/add-update-ledger-entry.mjs package.json tests/scripts/add-update-ledger-entry.test.js
git commit -m "$(cat <<'EOF'
feat(scripts): add atomic update-ledger entry CLI

Prompt for curated title/summary and prepend to update-ledger.json with fail-closed validation.
EOF
)"
```

---

### Task 5: Shell proposal + UpdateLedgerWindow

**Files:**
- Create: `src/pages/Landing/updateLedgerShellProposal.js`
- Create: `src/pages/Landing/UpdateLedgerWindow.jsx`
- Create: `src/pages/Landing/UpdateLedgerWindow.css`
- Test: `tests/pages/Landing/UpdateLedgerWindow.test.jsx`

**Interfaces:**
- Consumes: `DivLayoutRenderer`, `validateDivProposal`, `parseLedgerEntries`, wand tokens
- Produces: `<UpdateLedgerWindow />` region; exports `ledgerShell` constant

- [ ] **Step 1: Write the failing component tests**

```jsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../data/update-ledger.json?raw', () => ({
  default: JSON.stringify([
    {
      id: '2026-07-19-alpha',
      date: '2026-07-19',
      title: 'Alpha Title',
      summary: 'Alpha summary that is long enough to read clearly.',
    },
  ]),
}));

import UpdateLedgerWindow from '../../../src/pages/Landing/UpdateLedgerWindow.jsx';

afterEach(cleanup);

describe('UpdateLedgerWindow', () => {
  it('exposes a named region and list entries', () => {
    render(<UpdateLedgerWindow />);
    expect(screen.getByRole('region', { name: 'Scholomance Update Ledger' })).toBeTruthy();
    expect(screen.getByText('Alpha Title')).toBeTruthy();
    expect(screen.getByRole('list')).toBeTruthy();
  });

  it('shows empty chronicle when source is empty array', async () => {
    vi.resetModules();
    vi.doMock('../../data/update-ledger.json?raw', () => ({ default: '[]' }));
    const { default: EmptyLedger } = await import('../../../src/pages/Landing/UpdateLedgerWindow.jsx');
    render(<EmptyLedger />);
    expect(screen.getByText('Chronicle awaiting first entry')).toBeTruthy();
  });
});
```

If `?raw` mocking is awkward under Vitest, accept an optional `source` prop for tests only:

```jsx
// UpdateLedgerWindow.jsx
export default function UpdateLedgerWindow({ source } = {}) {
  const entries = parseLedgerEntries(source ?? ledgerSource);
  // …
}
```

Prefer the prop override for reliable unit tests; production omits it.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Landing/UpdateLedgerWindow.test.jsx`  
Expected: FAIL

- [ ] **Step 3: Author shell proposals (existing schema)**

`updateLedgerShellProposal.js`:

```js
import { validateDivProposal } from '../../features/divwand/validateDivProposal.js';

export const UPDATE_LEDGER_SHELL_PROPOSAL = {
  rationale: 'Landing twin-gate Update Ledger crystal frame.',
  confidence: 1,
  reviewRequired: false,
  sourceIntentHash: 'landing-update-ledger-shell-v1',
  proposedLayout: {
    id: 'ledger-root',
    type: 'container',
    role: 'card',
    style: { variant: 'glassmorphic', glowColor: 'psychic', borderRadius: 12 },
    layout: {
      display: 'flex',
      flexDirection: 'column',
      width: '100%',
      height: '100%',
      padding: 16,
      gap: 12,
    },
    children: [
      {
        id: 'ledger-header',
        type: 'container',
        role: 'header',
        layout: { display: 'flex', alignItems: 'center', height: 48 },
        style: { variant: 'transparent' },
        children: [],
      },
      {
        id: 'ledger-scroll',
        type: 'container',
        role: 'content',
        style: { variant: 'obsidianPanel', borderRadius: 8 },
        layout: {
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          padding: 12,
          gap: 10,
        },
        children: [],
      },
    ],
  },
};

export const SAFE_LEDGER_SHELL = {
  rationale: 'Minimal safe Update Ledger shell.',
  confidence: 1,
  reviewRequired: false,
  proposedLayout: {
    id: 'ledger-safe-root',
    type: 'container',
    role: 'card',
    style: { variant: 'obsidianPanel', borderRadius: 8 },
    layout: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', padding: 16, gap: 8 },
    children: [
      { id: 'ledger-safe-header', type: 'container', role: 'header', layout: { height: 40 }, style: { variant: 'transparent' }, children: [] },
      { id: 'ledger-safe-content', type: 'container', role: 'content', layout: { height: '100%' }, style: { variant: 'transparent' }, children: [] },
    ],
  },
};

const outcome = validateDivProposal(UPDATE_LEDGER_SHELL_PROPOSAL);
export const ledgerShell = outcome.valid ? UPDATE_LEDGER_SHELL_PROPOSAL : SAFE_LEDGER_SHELL;
```

Add a small unit assertion in the component test file (or sibling):

```js
import { validateDivProposal } from '../../../src/features/divwand/validateDivProposal.js';
import { UPDATE_LEDGER_SHELL_PROPOSAL, SAFE_LEDGER_SHELL } from '../../../src/pages/Landing/updateLedgerShellProposal.js';

expect(validateDivProposal(UPDATE_LEDGER_SHELL_PROPOSAL).valid).toBe(true);
expect(validateDivProposal(SAFE_LEDGER_SHELL).valid).toBe(true);
```

- [ ] **Step 4: Implement UpdateLedgerWindow**

```jsx
import ledgerSource from '../../data/update-ledger.json?raw';
import { DivLayoutRenderer } from '../../features/divwand/DivLayoutRenderer.jsx';
import { parseLedgerEntries } from './updateLedgerModel.js';
import { ledgerShell } from './updateLedgerShellProposal.js';
import { usePrefersReducedMotion } from '../../hooks/usePrefersReducedMotion.js';
import { motion } from 'framer-motion';
import '../../features/wand/wand-tokens.css';
import './UpdateLedgerWindow.css';

export default function UpdateLedgerWindow({ source } = {}) {
  const reduceMotion = usePrefersReducedMotion();
  const entries = parseLedgerEntries(source ?? ledgerSource, 30);

  return (
    <section
      className="update-ledger"
      role="region"
      aria-label="Scholomance Update Ledger"
      tabIndex={0}
    >
      <DivLayoutRenderer
        proposal={ledgerShell}
        slots={{
          title: (
            <h2 className="update-ledger__title">Scholomance Update Ledger</h2>
          ),
          content: entries.length ? (
            <ol className="update-ledger__entries">
              {entries.map((entry, index) => (
                <LedgerEntry key={entry.id} entry={entry} index={index} reduceMotion={reduceMotion} />
              ))}
            </ol>
          ) : (
            <p className="update-ledger__empty">Chronicle awaiting first entry</p>
          ),
        }}
      />
    </section>
  );
}
```

`LedgerEntry` base class always visible; optional `motion.li` only when `!reduceMotion`. No `onClick`. No links.

CSS requirements in `UpdateLedgerWindow.css`:

- Ignition + living rim on frame pseudo-elements (not whole panel blur)
- Entry reveal: opacity/translateY only
- `.update-ledger__entry { opacity: 1; transform: none; }`
- Reduced-motion media query from spec
- Title uses `var(--wand-title-glow)`; date `var(--wand-quiet-text)`; summary `var(--wand-summary-text)`
- Dark backing behind scroll text for storm contrast
- Internal overflow scroll on content slot / `.update-ledger__entries`

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/pages/Landing/UpdateLedgerWindow.test.jsx`  
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Landing/updateLedgerShellProposal.js src/pages/Landing/UpdateLedgerWindow.jsx src/pages/Landing/UpdateLedgerWindow.css tests/pages/Landing/UpdateLedgerWindow.test.jsx
git commit -m "$(cat <<'EOF'
feat(landing): add UpdateLedgerWindow via DivWand shell

Render curated chronicle entries in a validated DivWand glass shell with Wand voice tokens.
EOF
)"
```

---

### Task 6: Twin-gate Landing integration

**Files:**
- Modify: `src/pages/Landing/LandingPage.jsx`
- Modify: `src/pages/Landing/LandingPage.css`
- Test: `tests/pages/Landing/LandingPage.test.jsx`

**Interfaces:**
- Consumes: existing portal subtree + `UpdateLedgerWindow`
- Produces: `.landing-gates` with portal then ledger in DOM order

- [ ] **Step 1: Write the failing Landing smoke test**

```jsx
// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../../src/pages/Landing/StormCanvas.jsx', () => ({
  default: () => <div data-testid="storm" />,
}));
vi.mock('../../../src/pages/Landing/WatercolorDissolve.jsx', () => ({
  default: ({ children }) => <div data-testid="dissolve">{children}</div>,
}));

import LandingPage from '../../../src/pages/Landing/LandingPage.jsx';

afterEach(cleanup);

describe('LandingPage twin-gate', () => {
  it('renders portal before ledger and keeps enter control', () => {
    render(
      <MemoryRouter>
        <LandingPage />
      </MemoryRouter>
    );
    const enter = screen.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = screen.getByRole('region', { name: 'Scholomance Update Ledger' });
    expect(enter.compareDocumentPosition(ledger) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/pages/Landing/LandingPage.test.jsx`  
Expected: FAIL (ledger region missing)

- [ ] **Step 3: Restructure LandingPage**

Keep portal internals identical. Wrap composition:

```jsx
import UpdateLedgerWindow from './UpdateLedgerWindow.jsx';

// inside return of portal-scene:
<div className="landing-gates">
  <div className="landing-gate landing-gate--portal">
    <WatercolorDissolve dissolving={dissolving} onDissolveComplete={handleDissolveComplete}>
      {/* existing portal-gate unchanged */}
    </WatercolorDissolve>
  </div>
  <div className="landing-gate landing-gate--ledger">
    <UpdateLedgerWindow />
  </div>
</div>
```

Storm / moon / halo remain siblings behind gates (full-bleed). Do not wrap ledger in dissolve.

- [ ] **Step 4: Add twin-gate CSS**

In `LandingPage.css`, add `--landing-gate-width` and the grid rules from the spec (desktop two columns; `@media (max-width: 900px)` stack). Ensure `.portal-scene` can scroll on narrow if needed (`overflow: auto` on small screens) while desktop stays chamber-like. Position gates with `z-index` above storm.

Adjust `.portal-gate` centering so it lives inside the left gate footprint (remove absolute center-of-viewport assumptions that fight the grid — keep orb sizing clamps).

- [ ] **Step 5: Run tests**

Run:

```bash
npx vitest run tests/pages/Landing/LandingPage.test.jsx tests/pages/Landing/UpdateLedgerWindow.test.jsx tests/features/divwand/DivLayoutRenderer.test.jsx
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/pages/Landing/LandingPage.jsx src/pages/Landing/LandingPage.css tests/pages/Landing/LandingPage.test.jsx
git commit -m "$(cat <<'EOF'
feat(landing): compose twin-gate portal and update ledger

Place the Enter orb left and Scholomance Update Ledger right with responsive stacking.
EOF
)"
```

---

### Task 7: Playwright twin-gate verification

**Files:**
- Create: `tests/qa/e2e/landing-twin-gate.spec.js`

**Interfaces:**
- Consumes: running Vite app via Playwright `webServer` in `playwright.config.js`

- [ ] **Step 1: Write the e2e spec**

```js
import { expect, test } from '@playwright/test';

test.describe('Landing twin-gate', () => {
  test('desktop shows balanced gates; enter still reaches /read', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const portal = page.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    await expect(portal).toBeVisible();
    await expect(ledger).toBeVisible();

    const portalBox = await portal.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(portalBox).toBeTruthy();
    expect(ledgerBox).toBeTruthy();
    expect(portalBox.x + portalBox.width).toBeLessThan(ledgerBox.x);
    expect(Math.abs(portalBox.y + portalBox.height / 2 - (ledgerBox.y + ledgerBox.height / 2))).toBeLessThan(120);

    await portal.focus();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/read/, { timeout: 15000 });
  });

  test('narrow stacks portal above ledger', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');

    const portal = page.getByRole('button', { name: 'Enter Scholomance' });
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    const portalBox = await portal.boundingBox();
    const ledgerBox = await ledger.boundingBox();
    expect(portalBox.y).toBeLessThan(ledgerBox.y);
  });

  test('ledger region is keyboard-focusable without navigating', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const ledger = page.getByRole('region', { name: 'Scholomance Update Ledger' });
    await ledger.focus();
    await expect(ledger).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/\/?$/);
  });
});
```

- [ ] **Step 2: Run e2e**

Run: `npx playwright test tests/qa/e2e/landing-twin-gate.spec.js --project=chromium`  
Expected: PASS (fix layout CSS if geometry assertions fail; do not weaken by deleting geometry checks)

- [ ] **Step 3: Regression smoke for DivWand validator suite**

Run:

```bash
npx vitest run tests/qa/modulation/div-layout.test.js tests/features/divwand/DivLayoutRenderer.test.jsx tests/pages/Landing tests/scripts/add-update-ledger-entry.test.js
```

Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add tests/qa/e2e/landing-twin-gate.spec.js
git commit -m "$(cat <<'EOF'
test(e2e): verify landing twin-gate geometry and enter path

Lock desktop symmetry, narrow stacking, ledger focus isolation, and /read navigation.
EOF
)"
```

---

## Spec Coverage Checklist

| Spec requirement | Task |
|------------------|------|
| Twin-gate layout + responsive stack | 6, 7 |
| Curated JSON + `?raw` parse / empty state | 3, 5 |
| Missing file = build failure | 3 (tracked asset) |
| File order + max 30 | 3, 5 |
| Shared DivLayoutRenderer extraction | 1 |
| Shared Wand tokens | 2 |
| Fixed shell + SAFE fallback | 5 |
| Role-based slots (no schema fork) | 1, 5 |
| Motion + reduced-motion | 5 |
| Atomic CLI + fail-closed authoring | 4 |
| Playwright geometry | 7 |
| Dissolve orb-only / no ledger nav | 6, 7 |
| DivWand/Combat CSS non-regression | 1 |

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-19-scholomance-update-ledger.md`. Two execution options:

**1. Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration  

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints  

Which approach?
