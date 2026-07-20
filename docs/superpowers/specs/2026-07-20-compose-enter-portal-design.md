# Compose Enter Portal Button — Design Spec

**Date:** 2026-07-20  
**Status:** Implemented  
 
**Surface:** Landing twin-gate Enter orb (`LandingPage` left gate)

---

## Intent

Redo the Enter Scholomance portal button with Compose chrome: polish, buttery interaction performance, and visual fidelity — without changing dissolve/navigate behavior.

## Decisions (locked)

| Topic | Choice |
|---|---|
| Target | Landing Enter orb (`role="button"`, aria-label Enter Scholomance) |
| Rollout | **Always-on (A)** |
| Smoothness | **Both (C)** — interaction first, then ring motion |
| Architecture | Compose scene + React shell; storm/dissolve outside packet |

---

## Architecture

- Factory: `createEnterPortalScene()` → `PB-UI-SCENE-v1`
- Kind: `enter-portal-button`
- Parts: `hit-target`, `rings`, `content`
- Events: `PORTAL.ENTER`, `PORTAL.FOCUS`
- Shell: `ComposeEnterPortal` always-on in `LandingPage.jsx`
- Fallback: legacy markup if `validateComposeScene` fails
- Data/nav unchanged: `enteredRef`, WatercolorDissolve → `/read`

## Polish / perf / fidelity

- Press scale ~0.985 + ring brighten; focus-visible psychic halo
- Animate only transform/opacity; `contain: layout paint` on gate
- Energy ring on compositor layer; static under reduced-motion
- Sharper edge rim; richer energy conic (Wand palette)
- Hint beacon idle pulse; content non-blocking for hits

## Testing

- Packet golden + validate
- Keyboard Enter/Space once; jest-axe on gate
- Twin-gate e2e still finds Enter Scholomance

## Out of scope

- Storm canvas rewrite
- Feature flag
- Changing dissolve art or copy
