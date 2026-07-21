# Compose Full Light Mode Suite — Design Spec

**Date:** 2026-07-21  
**Status:** Draft — awaiting user review before implementation plan  
**Related:** ThemeToggle (`src/components/Navigation/ThemeToggle.jsx`), `useTheme`, Compose tokens (`src/core/compose/tokens/`), PDR Composed Component Architecture v2 §15

## Overview

Build an app-wide **Compose-owned dual theme suite** so every semantic token has an explicit dark and light twin. Light mode is a **pure white** system with first-class **layout density** tokens. Activation is exclusively through the existing sun/moon **ThemeToggle** (`data-theme` on `<html>` + `scholomance-theme` persistence).

## Goals

- Every Compose semantic token path exists in both `dark` and `light` suites (parity-gated).
- Light suite: pure white / near-white surfaces (`#ffffff` / `#fafafa`), dark ink text, accents only for interactive/state/school signal.
- Light suite includes layout-density and ornament tokens (airier chrome, flattened glow, ornament opacity near zero) — not color-only.
- One click on ThemeToggle flips colors **and** light layout density app-wide.
- Stable public CSS variable names preserved during migration (Compose PDR token migration law).
- Hard-coded dark literals in global CSS, IDE, nav, Compose shells, and kits rebind to Compose semantic aliases.

## Non-Goals

- A second theme switch or React theme prop tree for colors.
- Warm parchment / vellum light palette (Channel Zero’s cream light is replaced by aliasing onto pure white Compose light).
- Recoloring Landing photonic storm / galaxy canvas to white paint (may dim via ornament opacity only).
- Inventing the light palette purely by algorithmic invert of dark (authored light suite; transforms only for *derived* tokens).

## Decisions (approved)

| Decision | Choice |
|----------|--------|
| Palette | Pure white (A) |
| Scope | App-wide (C) — Compose + global/CSS/kits |
| Layout | Full theme mode (C) — color + density/ornament, tied to sun/moon |
| Architecture | Dual DTCG suites + Style Dictionary emit (Approach 1) |

## Architecture

```text
tokens/compose/themes/dark.json
tokens/compose/themes/light.json
        ↓
schema / parity validation
        ↓
Compose Style Dictionary (compose/css) + derived transform registry
        ↓
src/lib/css/generated/compose-themes.css
        ↓
:root, [data-theme='dark']  → dark suite (--compose-* + public aliases)
[data-theme='light']        → light suite (same names)
        ↓
ThemeToggle → useTheme → documentElement data-theme
        ↓
Nav, IDE, Compose shells, kits consume aliases → full flip
```

### Binding

- `ThemeProvider` already sets `document.documentElement.setAttribute('data-theme', theme)` and persists `scholomance-theme`.
- Invalid/missing storage falls back to `dark` (unchanged).
- No feature flag for theme application; token *generation* may live behind build scripts already used for school styles / Compose tokens.

### School accents

School hue CSS variables remain school signals on white. They must not become page background fills in light mode. Contrast of accent-on-white is tuned in the light suite (and school alias map where needed).

## Token inventory

Mirrored categories (same paths in both suites):

| Category | Example paths | Light rule |
|----------|---------------|------------|
| Surface | `color.surface.bg`, `bg-soft`, `default`, `elevated`, `canvas` | `#ffffff` / `#fafafa` only |
| Text | `color.text.primary`, `secondary`, `muted`, `inverse` | Near-black ink; inverse for on-accent |
| Border | `color.border.subtle`, `default`, `strong` | Cool light gray; strong may use accent |
| Accent / state | primary, success, warning, danger, school aliases | Hue kept; lightness for WCAG on white |
| Elevation | `shadow.sm/md/lg`, `panel` | Soft gray, low alpha — no abyss bloom |
| Glow | `glow.*`, focus rings | Near-zero bloom; opacity ≤ ~0.12 |
| Ornament | vignette, aurora, grain, rain intensity | Opacity → 0 or near-0 |
| Chrome density | nav/IDE pad, topbar height, panel gap, radius | Airier spacing, slightly larger radius, flatter chrome |
| Scrollbar | `scrollbar.thumb`, `scrollbar.track` (from `scrollbar.json`, theme-overridden in both suites) | Light thumb on white track |

### Derived transforms (registry)

Not a full invert pipeline. Examples:

- `glow-from-accent` — accent color + suite-specific opacity
- `focus-ring` — accent at suite opacity

Source tokens remain authored per suite; registry fills derived leaves so every leaf remains transformable without hand-duplicating formulas.

### Shared non-theme tokens

`tokens/compose/base.json` spacing/typography that must stay theme-invariant can remain shared. Theme-variant spacing for **chrome density** lives under theme suites (e.g. `layout.chrome.*`), not in shared base.

## Layout density behavior

Compose shells and global chrome read density tokens (exact names):

- `--compose-layout-chrome-pad`
- `--compose-layout-topbar-height`
- `--compose-layout-panel-gap`
- `--compose-layout-radius-chrome`
- `--compose-layout-ornament-opacity`

When `data-theme='light'`, these resolve from the light suite — **no second React tree**. Dark keeps current compact/ritual chrome metrics.

Ornament slots (vignette, aurora, heavy glow) respect `ornament-opacity` / related flags so light mode can effectively hide ritual chrome without deleting DOM.

## Migration plan (phased in implementation)

1. **Author suites** — Extract current dark semantic values into `dark.json`; author pure-white `light.json` with full path parity.
2. **Emit CSS** — Extend `src/core/compose/tokens` to load both suites, run parity + derived transforms, write `compose-themes.css`; import from `src/index.css` beside school-styles.
3. **Alias bridge** — Map stable public names (`--ritual-*`, IDE surfaces, `--cz-*`, nav) onto Compose semantic vars so existing selectors keep working.
4. **Rebind literals** — Replace hard-coded dark colors/metrics in `index.css`, IDE CSS, nav, Compose migrated shells, Channel Zero / visualizer kits with aliases; shrink hand-written `[data-theme='light']` blocks as suites absorb them.
5. **Channel Zero** — Convert CZ light block to thin alias layer over Compose light (pure white), removing competing cream palette.
6. **Verification** — Parity tests, emit tests, ThemeToggle integration, contrast samples, extend `verify:css-tokens` where alias map requires it.

### Migration law

- Existing public CSS variable names remain stable during migration.
- Generated files are not manually edited.
- Runtime school themes resolve through semantic aliases rather than hard-coded page backgrounds.
- Prefer alias + suite override over growing one-off `[data-theme='light']` patches.

## Components / file map (expected)

| Area | Path |
|------|------|
| Theme DTCG | `tokens/compose/themes/dark.json`, `light.json` |
| Token runtime / emit | `src/core/compose/tokens/` (suite load, parity, transforms, CSS emit) |
| Generated CSS | `src/lib/css/generated/compose-themes.css` |
| App import | `src/index.css` |
| Toggle (unchanged contract) | `ThemeToggle.jsx`, `useTheme.jsx` |
| Consumers | Nav, IDE chrome, Compose shells, kits |

## Error handling

| Case | Behavior |
|------|----------|
| Dark/light path set mismatch | Build/test **fail** (parity gate) |
| Missing public alias during migration | Keep CSS fallback; warn via verify / Compose token tests |
| Invalid `scholomance-theme` | Fall back to `dark` |
| Generate script failure | Fail build; do not ship partial theme CSS silently |

## Testing strategy

- **Unit:** suite path parity; CSS emit contains both theme blocks; derived transforms resolve.
- **Integration:** ThemeToggle → `data-theme=light` → sample aliases equal light suite white values; toggle back restores dark.
- **Smoke:** nav rail + Read chrome + at least one Compose shell (Oracle Terminal or Update Ledger) under light.
- **A11y:** text/surface contrast samples on light suite (primary text on `surface.bg`).
- **Regression:** existing `ui-theme-toggle` tests remain green; `verify:css-tokens` still passes (extended if needed).

## Success criteria

1. Every semantic theme token path exists in both suites (automated parity).
2. `data-theme='light'` yields pure-white surfaces and light chrome density without a second toggle.
3. Sun/moon button is the sole user-facing theme control and persists across sessions.
4. App surfaces that previously ignored light mode (beyond CZ patches) participate via aliases.
5. No manual edits required in generated `compose-themes.css`.

## Open implementation notes

- Exact public alias map (which `--ritual-*` / IDE vars bridge to which Compose paths) is enumerated in the implementation plan from a CSS inventory pass.
- Landing storm/galaxy: ornament dimming only unless a follow-up explicitly themes canvas materials.
- `COMPOSE_FLAGS` / `compose:tokens` from the PDR may gate *generation rollout* if needed; theme *application* remains the live `data-theme` attribute.
