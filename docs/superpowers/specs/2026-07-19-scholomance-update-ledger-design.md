# Scholomance Update Ledger Design

**Date:** 2026-07-19  
**Status:** Approved for implementation planning  
**Surface:** Landing page (`/`) — twin-gate composition  

## Purpose

Add a **Scholomance Update Ledger** to the landing chamber so visitors can see curated summaries of what shipped, while the Enter portal remains the primary call to action. The ledger is a public chronicle voice — informed by commit history, never a raw GitHub commit dump.

The portal says enter; the ledger says this world has been moving while you were away.

## Goals

- Twin-gate landing: Enter portal on the left, Update Ledger window on the right, symmetrically aligned.
- Curated entries: date + title + 1–2 sentence summary.
- Show the latest ~30 entries with in-window scroll, preserving file order.
- Construct the ledger through a **shared DivWand renderer** (structure) and **shared Wand tokens** (voice) — not by importing page-level studios.
- Maintain entries via a promptable Node script that atomically prepends to a static JSON file (newest first).

## Non-Goals

- Live GitHub API fetch on page load.
- Showing raw SHAs, authors, or commit messages as the primary UI.
- Embedding the full Wand / DivWand authoring studios on `/`.
- Dashboard cards, stats strips, or promo stickers over the storm.
- Melting the ledger with the watercolor dissolve (dissolve stays on the orb only).
- Moving the ledger to `public/` for runtime fetch (keeps static-bundle design).
- Redesigning the DivWand proposal schema while extracting the renderer.

## Approach

**Twin-gate Landing + static curated JSON**, rendered through shared DivWand layout primitives + shared Wand voice tokens.

| Concern | Owner |
|---|---|
| Chamber scene, storm, moon, dissolve → `/read` | Existing Landing portal subtree |
| Twin-gate placement (orb left, ledger right) | `LandingPage` layout only |
| Ledger window structure / glass chrome | Shared `DivLayoutRenderer` + ledger shell proposal |
| Ledger title glyph / entry emphasis | Shared `wand-tokens.css` |
| Entry content | `src/data/update-ledger.json` |
| Authoring new entries | `scripts/add-update-ledger-entry.mjs` + pure helpers |

## Failure Contract

| Failure | Behavior |
|---|---|
| Malformed JSON content (via `?raw` import + parse) | Empty-state chronicle; Landing remains usable |
| Malformed entry objects | Skip invalid rows; show valid ones up to 30 |
| Invalid DivWand shell proposal | Fall back to `SAFE_LEDGER_SHELL` (minimal known-valid proposal) |
| Missing tracked source file `src/data/update-ledger.json` | **Build-time failure** (appropriate for a tracked asset) |
| Script validation failure / corrupt existing document | No overwrite; non-zero exit |
| Failed atomic write | Original file unchanged; temp cleaned up when possible |

### JSON import rule

Do **not** use a conventional JSON module import:

```js
// BAD — Vite compile fails on malformed JSON; component never mounts
import ledgerEntries from "../../data/update-ledger.json";
```

Import as text and parse defensively:

```js
import ledgerSource from "../../data/update-ledger.json?raw";
```

A genuinely missing tracked source file remains a build failure. Supporting disappearance after deploy would require `public/` + runtime fetch, which adds async loading and weakens the static-bundle design. That path is out of scope.

## Layout & Composition

The landing scene remains one chamber (storm, moon, vignette). Inside it:

- **Left:** existing Enter scrying-orb / portal gate (click → watercolor dissolve → `/read`), shifted left of center.
- **Right:** Scholomance Update Ledger window, same vertical centerline, mirrored horizontal offset.
- Shared storm / moon / vignette stay full-bleed behind both.
- **Desktop:** matching outer gate footprints for visual symmetry (orb stays circular; ledger stays tall/textual — match footprints, not internal shapes).
- **Narrow viewports:** stack portal above ledger. Breakpoint is based on minimum combined gate width (~900px starting point), not a generic device category.

### Landing composition skeleton

```jsx
<main className="landing-page">
  <LandingAtmosphere />
  <div className="landing-gates">
    <div className="landing-gate landing-gate--portal">
      <ExistingPortalGate />
    </div>
    <div className="landing-gate landing-gate--ledger">
      <UpdateLedgerWindow />
    </div>
  </div>
</main>
```

DOM order establishes focus order: portal, then ledger. No positive `tabIndex` values on gates.

`WatercolorDissolve` wraps the orb (left gate) only — not the ledger.

## Data Model

**File:** `src/data/update-ledger.json`

```json
[
  {
    "id": "2026-07-19-song-stats-metrics",
    "date": "2026-07-19",
    "title": "CODEx Metrics meet Song Stats",
    "summary": "The Read page Metrics panel now draws from the Song Stats engine so lexical density and flow read as one chronicle."
  }
]
```

| Field | Rule |
|---|---|
| `id` | Stable string; script-generated (`YYYY-MM-DD` + deterministic slug from title) |
| `date` | ISO `YYYY-MM-DD` (valid calendar date) |
| `title` | Short impact line |
| `summary` | 1–2 sentences |
| Order | Newest first; **file order is authoritative** |
| Display cap | UI shows first **30** valid entries after filter (no re-sort) |

**Empty state:** “Chronicle awaiting first entry” when zero valid entries.

**Not shown in UI:** git SHAs, authors, GitHub links.

### Ordering decision

The UI preserves file order. It does **not** sort by date again. The script owns newest-first ordering so deliberately curated sequences are never silently rearranged.

## Shared Extraction Architecture

Do **not** import page-level DivWand or Wand implementations into Landing.

### DivWand — shared renderer

```text
src/features/divwand/
├── DivLayoutRenderer.jsx
├── divProposalSchema.js
├── validateDivProposal.js
└── divwand-shared.css
```

Consumers share the same primitives:

```text
DivWandPage ─────┐
Combat HUD ──────┼── DivLayoutRenderer
Landing Ledger ──┘
```

Extraction is **structural only**. Existing DivWand and Combat behavior remain unchanged. Retest DivWand and Combat before Landing work.

This reduces three risks:

1. Landing accidentally mounting authoring controls.
2. Page CSS leaking into the landing chamber.
3. DivWand renderer fixes diverging across copied implementations.

### Wand — shared voice tokens

Avoid importing `WandPage.css` wholesale (editor ancestry selectors can mutate unrelated descendants).

```text
src/features/wand/
└── wand-tokens.css
```

Example token families:

```css
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

Both Wand and the ledger consume these without coupling complete stylesheets. Glow belongs to borders and title accents; body copy needs a stable dark backing layer and restrained text shadow.

## Proposed Files

```text
src/
├── data/
│   └── update-ledger.json
├── features/
│   ├── divwand/
│   │   ├── DivLayoutRenderer.jsx
│   │   ├── divProposalSchema.js
│   │   ├── validateDivProposal.js
│   │   └── divwand-shared.css
│   └── wand/
│       └── wand-tokens.css
└── pages/
    └── Landing/
        ├── LandingPage.jsx
        ├── LandingPage.css
        ├── UpdateLedgerWindow.jsx
        ├── updateLedgerShellProposal.js
        └── updateLedgerModel.js

scripts/
├── add-update-ledger-entry.mjs
└── lib/
    └── update-ledger-entry.js

tests/
├── scripts/
│   └── add-update-ledger-entry.test.js
├── pages/
│   └── Landing/
│       ├── UpdateLedgerWindow.test.jsx
│       └── LandingPage.test.jsx
└── e2e/
    └── landing-twin-gate.spec.js
```

Separating the script’s pure behavior from its interactive prompt makes it testable without driving stdin.

## Component Contracts

### `updateLedgerModel.js`

Centralize data validation here.

```js
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLedgerEntry(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof value.id === "string" &&
      value.id.trim() &&
      typeof value.date === "string" &&
      ISO_DATE_PATTERN.test(value.date) &&
      typeof value.title === "string" &&
      value.title.trim() &&
      typeof value.summary === "string" &&
      value.summary.trim()
  );
}

export function parseLedgerEntries(source, limit = 30) {
  try {
    const parsed = JSON.parse(source);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter(isValidLedgerEntry)
      .slice(0, limit);
  } catch {
    return [];
  }
}
```

### `UpdateLedgerWindow.jsx`

```jsx
<section
  className="update-ledger"
  role="region"
  aria-label="Scholomance Update Ledger"
  tabIndex={0}
>
  <DivLayoutRenderer
    proposal={ledgerShell}
    slots={{
      title: <LedgerTitle />,
      content: entries.length ? (
        <ol className="update-ledger__entries">
          {entries.map((entry) => (
            <LedgerEntry key={entry.id} entry={entry} />
          ))}
        </ol>
      ) : (
        <p className="update-ledger__empty">
          Chronicle awaiting first entry
        </p>
      ),
    }}
  />
</section>
```

**Behavior boundaries**

- No `onClick` on the section.
- No nested route links.
- No dissolve wrapper.
- `tabIndex={0}` gives the scroll region keyboard focus.
- Use list semantics for entries.
- Entry animation must never be required for visibility.
- Invalid entries are excluded before rendering.

**Defensive visibility rule**

```css
.update-ledger__entry {
  opacity: 1;
  transform: none;
}
```

Motion may animate from another state, but base CSS remains visible. If JS or IntersectionObserver fails, the chronicle does not become invisible ink.

### DivWand shell proposal

Keep the proposal fixed and content-neutral. It defines **slots**, not ledger text. Exact property names must follow the existing DivWand model (illustrative shape below):

```js
export const UPDATE_LEDGER_SHELL_PROPOSAL = {
  schemaVersion: 1,
  type: "layout",
  variant: "landing-ledger",
  children: [
    {
      id: "ledger-frame",
      type: "container",
      role: "frame",
      variant: "crystal-glass",
      children: [
        {
          id: "ledger-header",
          type: "slot",
          role: "header",
          slot: "title",
        },
        {
          id: "ledger-scroll",
          type: "slot",
          role: "scroll-region",
          variant: "obsidian-scroll",
          slot: "content",
        },
      ],
    },
  ],
};
```

Validate **outside** the render hot path:

```js
const shellValidation = validateDivProposal(UPDATE_LEDGER_SHELL_PROPOSAL);
export const ledgerShell = shellValidation.valid
  ? shellValidation.value
  : SAFE_LEDGER_SHELL;
```

`SAFE_LEDGER_SHELL` is a minimal, known-valid proposal tested alongside the primary proposal.

## Twin-Gate CSS Contract

```css
.landing-gates {
  position: relative;
  z-index: 2;
  display: grid;
  grid-template-columns:
    minmax(0, var(--landing-gate-width))
    minmax(0, var(--landing-gate-width));
  align-items: center;
  justify-content: center;
  gap: clamp(2rem, 7vw, 8rem);
  width: min(100% - 3rem, 100rem);
  margin-inline: auto;
}

@media (max-width: 900px) {
  .landing-gates {
    grid-template-columns: minmax(0, 1fr);
    gap: clamp(1.5rem, 5vh, 3rem);
    width: min(100% - 2rem, 42rem);
    padding-block: 2rem 3rem;
  }

  .landing-gate--portal {
    min-height: min(58vh, 34rem);
  }

  .landing-gate--ledger {
    min-height: 24rem;
  }
}
```

## Curation Script

### Architecture

```text
Interactive shell
      ↓
collect prompt answers
      ↓
normalize and validate
      ↓
read current ledger
      ↓
construct next document in memory
      ↓
write temporary file
      ↓
atomic rename
```

Do not write the destination file until the entire next JSON document has been successfully generated.

### Pure helper API (`scripts/lib/update-ledger-entry.js`)

```js
export function createLedgerEntry({ title, summary, date }) {}
export function prependLedgerEntry({ existingEntries, entry }) {}
export function serializeLedger(entries) {
  return `${JSON.stringify(entries, null, 2)}\n`;
}
```

### Validation

| Field | Rule |
|---|---|
| Title | Trimmed, 3–100 characters |
| Summary | Trimmed, 20–500 characters |
| Date | Valid ISO calendar date |
| ID | Date plus deterministic slug |
| Duplicate ID | Reject; do not silently suffix |
| Existing document | Must be a JSON array |
| Existing invalid rows | **Do not silently destroy them during authoring** |

The UI may skip malformed rows; the authoring script fails closed when the source document is corrupt. Adding one entry must never quietly erase damaged historical data.

### Atomic write

```js
const temporaryPath = `${ledgerPath}.tmp`;
await writeFile(temporaryPath, serialized, "utf8");
await rename(temporaryPath, ledgerPath);
```

Clean up the temporary file on failure when possible.

### Prompt / CLI

Use `node:readline/promises`. Support an optional date flag:

```bash
node scripts/add-update-ledger-entry.mjs
node scripts/add-update-ledger-entry.mjs --date 2026-07-18
```

Package command:

```json
{
  "scripts": {
    "ledger:add": "node scripts/add-update-ledger-entry.mjs"
  }
}
```

## Motion Contract

Use only these three effects:

1. **Ignition** (once on frame mount): opacity `0.75 → 1`, edge glow low → medium → resting, ~700–1000ms.
2. **Living rim**: animate a pseudo-element or narrow gradient layer — not the entire panel (avoid GPU fill-rate pressure over the full-screen storm).
3. **Entry reveal**: opacity `0 → 1`, `translateY(6px) → 0`. No blur animation on every row.

### Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  .update-ledger,
  .update-ledger *,
  .update-ledger *::before,
  .update-ledger *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

Also pass the reduced-motion result into Framer Motion; do not rely on CSS alone.

## Implementation Order

### Phase 1: Shared primitives

1. Locate current DivWand renderer and validator.
2. Extract renderer-level code without changing behavior.
3. Extract Wand chrome tokens.
4. Retest DivWand and Combat before touching Landing.

### Phase 2: Data pipeline

1. Add curated JSON.
2. Add ledger parser and entry validator.
3. Add prompt script and pure helpers.
4. Add script tests.

### Phase 3: Ledger component

1. Add fixed shell proposal.
2. Validate the proposal; wire `SAFE_LEDGER_SHELL` fallback.
3. Bind semantic slots.
4. Add empty state and malformed-row filtering.
5. Add reduced-motion-safe animation (base CSS visible).

### Phase 4: Twin-gate integration

1. Wrap the current portal without modifying its internal interaction.
2. Add grid composition + responsive stack.
3. Confirm DOM and focus order.
4. Confirm dissolve remains orb-scoped.

### Phase 5: Browser verification

1. Desktop symmetry.
2. Narrow stacking.
3. Keyboard scrolling.
4. Reduced-motion emulation.
5. Existing portal entry and transition.
6. Long-summary and 30-entry stress fixture.

## QA Checklist

### Script

- [ ] Valid entry is prepended.
- [ ] Existing entry order is preserved.
- [ ] Empty title exits non-zero.
- [ ] Empty summary exits non-zero.
- [ ] Invalid date exits non-zero.
- [ ] Duplicate ID exits non-zero.
- [ ] Corrupt existing JSON is not overwritten.
- [ ] Failed write leaves the original file unchanged.
- [ ] Serialized file ends with one newline.

### Data and rendering

- [ ] Only valid objects render.
- [ ] Maximum of 30 entries renders.
- [ ] File order is retained.
- [ ] Empty array renders the chronicle empty state.
- [ ] Malformed JSON source renders the empty state.
- [ ] Long titles and summaries wrap without horizontal overflow.

### Accessibility

- [ ] Portal is focused before ledger.
- [ ] Ledger has an accessible region name.
- [ ] Entries use list semantics.
- [ ] Focused ledger can scroll with keyboard controls.
- [ ] No ledger text triggers navigation.
- [ ] Visible focus treatment survives the glass glow.
- [ ] Contrast remains readable with the brightest storm frame.

### Regression

- [ ] Orb click enters `/read`.
- [ ] Enter activates the focused orb.
- [ ] Space activates the focused orb.
- [ ] Watercolor dissolve affects only the portal.
- [ ] Existing storm, moon, and vignette remain full-bleed.
- [ ] DivWand authoring UI never appears on Landing.
- [ ] Combat’s DivWand-derived HUD remains unchanged.

### Responsive

- [ ] Wide viewport presents two balanced gate footprints.
- [ ] Mid-width viewport does not crush the ledger text.
- [ ] Narrow viewport stacks portal before ledger.
- [ ] Ledger internal scroll does not trap the entire page.
- [ ] Mobile browser height changes do not clip the portal CTA.

**Note:** Responsive geometry requires Playwright (or equivalent). jsdom class-name assertions are not evidence that two gates are visually aligned.

## Main Remaining Risks

1. **DivWand extraction becomes a disguised refactor** — Keep the first extraction mechanical; do not redesign the proposal schema while adding the ledger.
2. **Imported page CSS leaks** — Extract shared variants and tokens; do not import `DivWandPage.css` or `WandPage.css` globally into Landing.
3. **Storm overpowers summary text** — Glow on borders/title only; body copy needs stable dark backing.
4. **Symmetry becomes rigidity** — Match outer gate footprints, not exact internal dimensions.
5. **Scroll animation hides entries** — Default entries to visible; motion enhances arrival, never controls existence.
6. **Responsive proof needs a real browser** — Vitest for semantics; Playwright for viewport geometry.

## Acceptance Contract

The implementation is complete when:

1. `LandingPage` owns only the two-gate arrangement.
2. The portal subtree retains its current transition and navigation behavior.
3. `UpdateLedgerWindow` receives sanitized entries and renders no more than 30.
4. The ledger shell is rendered through a shared DivWand renderer.
5. Ledger typography consumes shared Wand tokens.
6. The script performs an atomic prepend and fails closed.
7. Malformed data degrades to the chronicle empty state; a missing tracked JSON file is a build-time failure.
8. Desktop and narrow behavior are browser-tested.
9. Reduced-motion mode contains no shimmer or stagger.
10. Existing DivWand, Combat, and Landing tests remain green.
