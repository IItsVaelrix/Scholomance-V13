# Compose Update Ledger — Design Spec

**Date:** 2026-07-20  
**Status:** Implemented  
**Surface:** Landing twin-gate Update Ledger (`/`, `UpdateLedgerWindow`)

---

## Intent

Spruce the Update Ledger with a CLI-esque Scholomance console vibe, using Compose as the chrome contract so the architecture is exercised beyond the toolbar pilot.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Motion pattern | **Hybrid (C):** raining header + short CLI boot banner + staggered entries |
| Size | **Balanced (B):** ~30–40% more content height; equal visual weight with Enter portal |
| Rollout | **Always-on (C):** Compose under the hood, no feature flag |
| Architecture | **Approach 1:** Compose scene chrome + React body; DivWand fallback only on scene failure |

---

## Architecture

### Host

- `src/pages/Landing/UpdateLedgerWindow.jsx` remains the public component.
- Always mounts Compose-backed chrome (no `compose:migrate:ledger` gate).
- Data path unchanged: `parseLedgerEntries` + `src/data/update-ledger.json`.

### Compose contracts

- Factory: `createUpdateLedgerScene({ entryCount })` → `PB-UI-SCENE-v1`.
- Kind: `update-ledger-window`.
- Anatomy parts:
  - `header` — title + status chip host
  - `boot` — CLI boot lines host
  - `scroll` — entry list host
- Optional WAND ornament on header: **off by default** on landing.
- Golden fixture: `tests/qa/features/fixtures/update-ledger-window.pb-ui-scene.v1.json`.
- Definition registered via migration helper for tracking (flag not required for render).

### React shell

- Prefer `ComposeUpdateLedger` (or equivalent) that:
  1. Emits/loads scene → `renderSceneToDomSpec`
  2. Mounts slot hosts for header / boot / scroll
  3. Renders `DigitalRainText` (shared with IDE MatrixTitle mechanics) for the title
  4. Runs boot sequence, then entry list
- On `validateComposeScene` failure: fall back to existing DivWand `ledgerShell` (safe path).

### Shared rain helper

- Extract MatrixTitle scramble-settle logic into a reusable `DigitalRainText` (or `src/components/DigitalRainText.jsx`) so IDE and ledger share one mechanism.
- Respect `usePrefersReducedMotion`: plain text, no scramble; boot lines appear fully formed.

---

## Chrome & motion

### Chrome

- Deeper obsidian frame: inset bevel, dual-tone psychic/obsidian rim.
- Living rim retained: quieter idle, sharper on focus-within.
- Header: monospace status chip `CHRONICLE // ONLINE` beside raining title.
- Scroll body: taller padding, denser rows (date gutter + title + 2-line summary clamp).
- Scrollbar: thin Wand-arc track; focus ring on scroll region only.

### Boot sequence (once per mount)

1. `> binding chronicle…`
2. `> entries sealed: N` (N = parsed entry count)
3. `> ready.`

Then entries stagger in (Framer Motion; slower first wave). Reduced-motion: show all three boot lines immediately, then entries without delay cascade.

### Size

- Adjust `LandingPage.css` / twin-gate so `.landing-gate--ledger` gains ~30–40% content height and roughly equal visual weight with the portal.
- Still viewport-clamped; must not overwhelm or break ≤900px stack layout.

---

## Out of scope

- Changing ledger JSON schema or entry fields.
- Pixel-identical IDE rain timing (shared helper, ledger-tuned durations OK).
- Skia/Canvas hybrid paint on ledger.
- Feature-flagged A/B against classic DivWand as primary path.

---

## Testing

| Layer | Coverage |
|---|---|
| Packet | Golden canonicalize + `validateComposeScene` |
| Component | Reduced-motion skips rain; boot shows count; `aria-label` region |
| A11y | jest-axe on ledger region |
| Regression | Update existing `UpdateLedgerWindow.test.jsx` selectors |

---

## Success criteria

1. Landing ledger reads as a polished Scholomance console, not a generic glass card.
2. Boot + rain feel intentional; reduced-motion remains fully usable.
3. More chronicle text visible without dominating the portal.
4. Compose scene is the chrome source of truth with a lawful DivWand fallback.
5. Packet golden and a11y tests pass.
