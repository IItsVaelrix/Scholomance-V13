# PolarisOS Stateful Lattice Console — Design Spec

**Date:** 2026-07-28

**Status:** Approved design; pending written review

**Surface:** `PolarisOS/apps/client`

**Primary target:** Desktop browser

**Secondary target:** 1280×800 Steam Deck

## 1. Purpose

Replace the current PolarisOS client shell with a compelling arcane terminal
that feels like a forbidden machine rather than a generic dark dashboard.

The selected direction is a **Stateful Lattice Console**:

- a desktop-first scene altar makes the rendered world the visual focus;
- typed commands remain central, while visible controls support mouse, touch,
  keyboard, and controller navigation;
- Compose owns component anatomy, layout intent, slots, and semantic structure;
- DOM and CSS own readable text, controls, focus, and accessibility;
- PixelBrain SCDL owns deterministic ornament geometry;
- Pixi owns only the authoritative world scene;
- Photonic Retina acts as a design-time eye over controlled renders.

The interface uses **latent ritualism**. At rest it is restrained and legible.
Sigils, tracery, and chromatic energy awaken only in response to focus,
commands, discoveries, warnings, corruption, or connection changes.

## 2. Locked Decisions

| Topic | Decision |
|---|---|
| Emotional center | Ritual command deck |
| Interaction model | Hybrid command interface |
| Primary viewport | Desktop-first |
| Central hierarchy | Scene altar |
| Ornament intensity | Latent ritualism |
| Technical approach | Stateful Lattice Console |
| Text and controls | Semantic DOM/CSS |
| World rendering | Existing Pixi renderer |
| Ornament authoring | PixelBrain SCDL, compiled at build time |
| UI structure | Canonical Compose contracts |
| Layout precedents | DivWand, Wand, and PhotonicBridgeLab |
| Visual observation | Design/test-only Photonic Retina bench |

## 3. Goals

1. Give PolarisOS a recognizable visual identity grounded in game state.
2. Keep commands, narrative, navigation, and diagnostics readable.
3. Preserve world authority and the existing renderer boundary.
4. Make focus, pending work, success, warnings, corruption, and disconnection
   visually distinct without relying on color alone.
5. Use deterministic SCDL assets rather than hand-edited generated output.
6. Establish reusable components instead of adding a one-off visual skin.
7. Provide deterministic desktop and Steam Deck verification surfaces.

## 4. Non-Goals

- Replacing Pixi with a DOM, SVG, or Compose world renderer.
- Rendering all text and controls inside a canvas.
- Compiling SCDL in the browser.
- Adding multi-frame PixelBrain packet animation to
  `pixelbrain.render.v1`.
- Importing the root application's React page components into PolarisOS.
- Making the Photonic observation bench part of the production player.
- Reworking server world authority, command semantics, or simulation rules.
- Building a general-purpose MMORPG UI framework in this milestone.

## 5. Existing Contracts Preserved

The world continues to produce the picture:

```text
authoritative world state
  -> SceneCompiler
  -> SceneManifest
  -> PixiSceneRenderer
  -> Scene Altar render portal
```

The new interface surrounds that portal but does not change entity existence,
placement, z-order, visibility, interaction regions, commands, lighting, or
world state.

PixelBrain remains a visual asset provider. It controls packet-local pixels,
palette, transparency, and silhouette. Polaris controls where and why an
attachment is shown.

## 6. Architecture

### 6.1 Layer ownership

The client has five explicit layers:

1. **Protocol adapter**
   - Validates incoming WebSocket messages.
   - Converts them into one stable `PolarisUiState`.
   - Preserves the last valid state when a malformed message arrives.

2. **Compose authoring and build adapter**
   - Defines the shell as canonical `PB-UI-SCENE-v1`.
   - Validates the scene using the root Compose implementation.
   - Converts it with the canonical DOM adapter during the build.
   - Emits a runtime-neutral DOM plan and generated token CSS for Polaris.

3. **Polaris DOM host**
   - Mounts semantic elements from the generated DOM plan.
   - Binds dynamic content and `data-state` values from `PolarisUiState`.
   - Owns focus, keyboard/controller navigation, scroll behavior, and live
     announcements.

4. **PixelBrain attachment host**
   - Resolves immutable SCDL-derived assets from the existing fingerprinted
     registry.
   - Mounts them only in named Compose visual slots.
   - Falls back to CSS geometry without removing semantic content.

5. **Pixi scene portal**
   - Mounts the existing renderer inside the Scene Altar.
   - Retains nearest-neighbor sampling and integer placement.
   - Falls back to the existing text scene when Pixi cannot render.

### 6.2 Compose package boundary

The canonical Compose implementation currently lives under
`src/core/compose`; it is not a Polaris workspace package. Polaris must not
reach across workspaces at runtime or duplicate the Compose schema.

The lawful boundary is a build-time adapter:

```text
Polaris console authoring
  -> validateComposeScene
  -> renderSceneToDomSpec
  -> generated DOM plan + token CSS
  -> Polaris runtime host
```

The generated DOM plan contains stable IDs, semantic roles, named parts,
layout classes, and visual attachment slots. Runtime state binding remains in
Polaris and may not mutate the generated anatomy.

The implementation plan may extract the existing Compose core into a shared
package later, but that refactor is not required for this UI milestone.

### 6.3 Reference-page usage

The following pages are design and implementation precedents, not runtime
dependencies:

- `src/pages/DivWand/DivWandPage.jsx` and `DivWandPage.css`
  - viewport-bound workspace;
  - compact header and pane bars;
  - contained preview portal;
  - accessible terminal log;
  - inspector/grid concepts.
- `src/pages/Wand/WandPage.jsx` and `WandPage.css`
  - tabbed control panels;
  - visual canvas containment;
  - telemetry overlays;
  - terminal diagnostics;
  - reduced-motion treatment.
- `src/pages/internal/photonic-bridge/PhotonicBridgeLab.jsx` and its CSS
  - responsive metric grids;
  - diagnostics grouped by severity;
  - explicit bridge state and visual-byte inspection.
- `src/pages/DivWand/components/WorldScenePortal.jsx`
  - a rendered scene hosted inside a bounded DOM region.

Polaris reuses their patterns and token vocabulary. It does not import their
React components or page-local state.

## 7. Layout

### 7.1 Desktop shell

```text
┌──────────────────────── System Header ────────────────────────┐
│                                                              │
├────── Bearing Rail ─────┬──────── Scene Altar ───────┬────────┤
│                         │                            │Telemetry│
│ location                │         Pixi world         │  Rail  │
│ exits                   │                            │        │
│ nearby entities         ├──────── Chronicle ─────────┤        │
│ navigation actions      │ narrative and diagnostics  │        │
│                         ├────── Command Conduit ──────┤        │
│                         │ input, suggestions, hints   │        │
└─────────────────────────┴────────────────────────────┴────────┘
```

The desktop body uses constrained side rails and a fluid center:

```css
grid-template-columns:
  minmax(220px, 0.8fr)
  minmax(640px, 2.4fr)
  minmax(260px, 1fr);
```

Exact values may be tokenized during implementation, but these invariants are
fixed:

- the Scene Altar receives the largest share;
- side rails have readable lower bounds;
- the Chronicle and Command Conduit stay directly under the scene;
- the viewport shell owns overflow, while each long panel scrolls internally;
- no percentage-width split may allow the center to collapse.

### 7.2 Narrow desktop and Steam Deck

At narrower widths:

- the Telemetry Rail becomes a tabbed drawer;
- the Bearing Rail remains visible until the Steam Deck breakpoint;
- the Scene Altar remains the largest region;
- command input remains persistent;
- all controller targets meet the minimum target-size token;
- the Steam Deck layout is a deliberate simplification, not a scaled-down
  desktop screenshot.

## 8. Component Anatomy

### 8.1 `PolarisConsoleShell`

Top-level landmark and state boundary. It owns the viewport grid, connection
state, reduced-motion attribute, and controller navigation mode.

### 8.2 `SystemHeader`

Contains:

- world name;
- current location;
- connection seal plus text label;
- help or settings only when backed by implemented actions;
- optional developer observation status outside production builds.

### 8.3 `BearingRail`

Contains exits, nearby entities, and navigation actions. When its content
exceeds the available height, it adopts Wand-style tabbed sections rather than
shrinking targets or overflowing the shell.

### 8.4 `SceneAltar`

Contained render portal for Pixi. It provides:

- a semantic title and text fallback;
- a bounded render host;
- an unobtrusive scene-status strip;
- optional development-only grid and inspector overlays;
- PixelBrain frame slots that do not overlap interactive world regions.

### 8.5 `Chronicle`

Scrollable narrative and diagnostic history:

- uses `role="log"` with polite announcements;
- appends without stealing focus;
- distinguishes narration, command echoes, success, warning, and error;
- keeps readable DOM text instead of rasterized glyphs.

### 8.6 `CommandConduit`

Persistent command surface:

- labeled text input;
- contextual action suggestions derived only from currently available protocol
  actions;
- command history;
- visible keyboard and controller hints;
- pending and retry affordances;
- no automatic replay after timeouts or reconnects.

### 8.7 `TelemetryRail`

Contains selected-entity and session diagnostics. Player state, inventory
summary, and active conditions appear only when the current protocol supplies
them; this design does not add new server mechanics. Small values use
PhotonicBridgeLab-style auto-fit metric grids. Text-heavy details use ordinary
lists and definition lists.

### 8.8 `ArcanePanel`

Shared Compose primitive used by both rails and the Chronicle. Named parts:

- `header`;
- `title`;
- `status`;
- `body`;
- `footer`;
- `corner-nw`, `corner-ne`, `corner-sw`, `corner-se`;
- `divider`;
- `seal`;
- `state-glyph`.

All decorative parts are `aria-hidden`. Semantic content remains usable when
every visual attachment is absent.

## 9. Design Tokens

Compose tokens are the source of truth and generate CSS custom properties.
Token groups include:

- surfaces: void, panel, inset, raised;
- text: primary, secondary, muted, inverse;
- semantic state: focus, pending, success, warning, corrupted, disconnected;
- spacing and panel gaps;
- border and pixel-rim widths;
- typography: display, body, mono, numeric;
- target sizes;
- scene and rail minimums;
- motion durations;
- layer names.

The default palette is obsidian and desaturated brass. Cyan is reserved for
focus and active instrumentation; green for confirmed success; amber for
pending and warning; crimson/magenta for corruption and errors. A state must
never depend on color alone.

## 10. SCDL Asset System

### 10.1 Authoring

SCDL sources define:

- panel corner assemblies;
- horizontal and vertical divider rails;
- connection seals;
- focus cursors;
- status lamps;
- meter shells;
- command-execution sigils;
- warning and corruption fracture marks.

Authoring follows painter order and a role-based palette. Symmetry establishes
structural forms; highlights and damage remain deliberately asymmetric.
Assets use only SCDL operations implemented by the current rasterizer. Reserved
transform, boolean, and instancing operations are not part of this milestone.

### 10.2 Variant families

The initial state vocabulary is:

| State | Meaning |
|---|---|
| `rest` | Dormant, readable default |
| `focus` | Keyboard/controller focus |
| `pending` | Command submitted, response outstanding |
| `success` | Confirmed operation |
| `warning` | Recoverable issue or degraded state |
| `corrupted` | Rejection, invalid state, or severe failure |
| `disconnected` | No live server connection |

Example registry roles:

```text
arcane-panel/rest/corners
arcane-panel/focus/corners
arcane-panel/warning/seal
arcane-panel/corrupted/divider
command-conduit/pending/sigil
connection/disconnected/seal
```

Every variant within a family has identical dimensions and anchors. Variant
switches therefore cannot cause layout shifts.

### 10.3 Runtime

SCDL is checked and compiled at build time. Generated JSON/PNG/SVG outputs are
never hand-edited. The browser resolves static assets from the immutable
registry.

The current bridge supports one static frame. Awakening therefore uses variant
selection plus restrained CSS opacity/light transitions. It does not depend on
packet-local animation or SCDL `glow` rasterization.

Integer dimensions, nearest-neighbor sampling, and whole-number display scales
are mandatory for raster attachments.

## 11. State and Data Flow

### 11.1 Normalized state

The protocol adapter emits one stable state with at least:

- connection status;
- world and room identity;
- current location;
- exits;
- visible entities;
- selected entity;
- narrative transcript;
- available actions;
- player summary when supplied by the protocol;
- pending command;
- latest diagnostic severity;
- input and navigation mode.

### 11.2 Render flow

```text
WebSocket message
  -> protocol validation
  -> PolarisUiState reducer
  -> component selectors
  -> semantic DOM content
  -> data-state attributes
  -> SCDL attachment resolution
```

Compose anatomy stays stable. Only bound content, state attributes, visibility
of optional semantic regions, and attachment variants change.

### 11.3 Command flow

```text
user input
  -> local syntax validation
  -> pending state
  -> WebSocket send
  -> authoritative response
  -> Chronicle entry + new PolarisUiState
```

Commands never optimistically mutate authoritative world state. A timeout
exposes a retry action but does not replay automatically.

## 12. Photonic Observation Bench

### 12.1 Purpose

Photonic Retina becomes a design-time eye over the actual composed shell. It
does not claim human visual judgment and does not replace screenshot review or
accessibility tests.

### 12.2 Inputs

For each controlled state and viewport, the bench captures:

1. rendered RGBA pixels;
2. Compose node rectangles, stable IDs, semantic roles, and emphasis;
3. a deterministic coarse visual lattice in canonical row-major order.

The bench encodes:

- the raster through Retina `pixels`;
- node geometry through `coordinates`;
- the coarse visual grid through `lattice`.

### 12.3 Indexing invariant

Retina packet vector slots are compressed and must never be treated as screen
cells. Spatial masks are computed from the uncompressed coarse lattice before
Retina encoding:

```text
cell index = row * cols + col
```

The Retina packet is a deterministic fingerprint and diagnostic artifact.
Cell-level change and attention maps use the row-major lattice arrays directly,
matching the existing Photonic Retina perception law.

### 12.4 Outputs

The bench reports:

- raster and layout fingerprints;
- changed-cell coverage;
- unexpected geometry drift;
- missing expected state changes;
- unexpectedly broad attention coverage;
- clipped or collapsed Compose nodes;
- bridge diagnostics grouped by severity.

Thresholds are fixtures per viewport and state, not self-adjusting runtime
heuristics.

### 12.5 Canonical fixtures

Initial controlled viewports:

- 1440×900 desktop;
- 1280×800 Steam Deck.

Initial states:

- connected/rest;
- focus traversal;
- command pending;
- command success;
- warning;
- corrupted/rejected;
- disconnected;
- missing PixelBrain attachment;
- Pixi text fallback.

## 13. Failure Handling

| Failure | Required behavior |
|---|---|
| Missing SCDL asset | Render CSS frame; emit one diagnostic; preserve content |
| Invalid Compose scene at build | Fail the UI asset build; do not emit a partial plan |
| Missing generated DOM plan | Mount a minimal semantic recovery shell |
| Pixi initialization/render failure | Activate existing text scene fallback |
| WebSocket disconnect | Preserve Chronicle and input; disable world actions; expose reconnect |
| Malformed server message | Quarantine message; retain last valid state |
| Command timeout | Show retryable warning; never replay automatically |
| Photonic bench failure | Fail the required visual-QA job with diagnostics; never affect production |

Failure messages use plain language plus diagnostic identifiers where
available. Decorative corruption effects may accompany an error but may not
obscure the recovery action.

## 14. Accessibility

- Use semantic landmarks, headings, lists, definition lists, forms, labels,
  buttons, and status regions.
- Keep the Chronicle as a polite live log.
- Distinguish focus from magical selection and active-world state.
- Preserve a visible focus indicator in every visual state.
- Support keyboard and controller traversal with predictable order.
- Restore focus after drawers close and command outcomes settle.
- Make all status changes legible without color.
- Meet WCAG AA contrast for text, focus indicators, and actionable controls.
- Respect `prefers-reduced-motion`; remove pulses, scanlines, animated tracery,
  and stagger effects.
- Allow browser zoom and text scaling without collapsing the Scene Altar.
- Keep decorative SCDL assets out of the accessibility tree.
- Do not announce decorative visual-state changes.

## 15. Verification

### 15.1 Unit

- protocol messages normalize into stable `PolarisUiState`;
- selectors emit the correct component and visual states;
- command pending, response, timeout, and retry transitions are deterministic;
- attachment keys resolve from component/state pairs.

### 15.2 Compose and component

- console scene validates as canonical `PB-UI-SCENE-v1`;
- golden canonicalization detects anatomy drift;
- generated DOM plan contains all required parts and slots;
- semantic roles, focus order, keyboard operation, and ARIA behavior pass;
- reduced motion preserves all information and controls.

### 15.3 SCDL and registry

- every source passes `scdl check`;
- every required state family compiles;
- variants share dimensions and anchors;
- generated assets enter the fingerprinted registry;
- missing-asset fallback is exercised.

### 15.4 Integration

- server events update only the intended panels;
- commands handle success, rejection, timeout, and reconnect;
- malformed messages preserve the last valid state;
- Pixi failure reveals the text scene;
- controller and keyboard traversal reach every action.

### 15.5 Visual and Photonic

- controlled screenshots at 1440×900 and 1280×800;
- ordinary screenshot diffs for human-readable rendering;
- DOM geometry assertions for clipping and minimum sizes;
- Photonic fingerprints and row-major changed-cell diagnostics;
- focus, pending, warning, corruption, disconnection, and fallback fixtures;
- reduced-motion snapshots without animated effects.

## 16. Performance Boundaries

- No runtime SCDL compiler.
- No production Photonic observation pass.
- No full-page canvas UI.
- No continuous DOM screenshotting.
- PixelBrain assets are immutable and cacheable.
- State changes update only affected components and attachment hosts.
- Scanline or light effects must be CSS-only, bounded, and disabled by reduced
  motion.

## 17. Delivery Sequence

The implementation plan should preserve these dependency stages:

1. Compose scene, tokens, generated DOM plan, and semantic CSS shell.
2. `PolarisUiState` adapter and component bindings.
3. Scene Altar portal and existing text fallback.
4. SCDL attachment families and registry integration.
5. Command/failure states and controller navigation.
6. Photonic Observation Bench and canonical fixtures.
7. Full accessibility, integration, visual, and performance verification.

The shell must remain usable after each stage. PixelBrain ornament and Photonic
observation are enhancements over a complete semantic interface, not
prerequisites for basic operation.

## 18. Risks and Mitigations

1. **Cross-workspace Compose coupling**
   - Mitigation: canonical build-time adapter and generated runtime-neutral
     plan; no imports from root React pages.
2. **Arcane ornament overwhelms content**
   - Mitigation: latent ritualism, limited semantic palette, fixed attachment
     slots, and Photonic attention-coverage fixtures.
3. **Pixel alignment drift**
   - Mitigation: identical variant dimensions, integer anchors, nearest-neighbor
     scaling, and registry tests.
4. **Photonic vector index misused as a spatial map**
   - Mitigation: all cell masks derive from the uncompressed row-major lattice;
     packets are fingerprints only.
5. **Canvas accessibility regression**
   - Mitigation: canvas remains limited to the Scene Altar; every control and
     narrative element stays in semantic DOM.
6. **Responsive layout treated as scaling**
   - Mitigation: explicit Steam Deck composition with drawers and persistent
     command access.
7. **Current direct-DOM client grows monolithic**
   - Mitigation: isolate state adapter, generated-plan host, components,
     attachment resolver, scene portal, and observation bench behind narrow
     interfaces.

## 19. Success Criteria

The design is successful when:

1. The first impression is “forbidden ritual machine,” not “purple admin
   dashboard.”
2. The scene is immediately recognizable as the central altar.
3. Commands are fast by keyboard and fully usable through visible controls.
4. Resting UI is quiet; state changes awaken only the relevant regions.
5. Narrative and controls remain readable with all SCDL assets disabled.
6. Pixi, Compose, SCDL, and Photonic Retina each stay within their authority.
7. The 1440×900 and 1280×800 fixtures pass semantic, visual, and Photonic
   verification.
8. Missing assets, disconnects, malformed messages, timeouts, and renderer
   failures remain recoverable.

## 20. Approval Record

The user approved:

- ritual command deck;
- hybrid command interaction;
- desktop-first layout;
- scene altar hierarchy;
- latent ritualism;
- Stateful Lattice Console architecture;
- DivWand/Wand/PhotonicBridgeLab layout precedents;
- Photonic Retina as a design-time eye;
- architecture, components, data flow, failure handling, accessibility, and
  verification sections.
