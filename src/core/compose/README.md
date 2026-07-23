# Composed Component Architecture

A five-layer architecture for building accessible, composable UI components with semantic meaning, established anatomy, intelligent layout, headless behavior, and flexible rendering.

## Phase 1 Status: ✅ Packet + Toolbar Pilot

PDR Phase 1 exit gate (ScrollEditorToolbar) is implemented behind flags:

- ✅ `SCHOL-COMPONENT-DEFINITION-v1` + `PB-UI-SCENE-v1` / `PB-LAYOUT-v1` / `PB-UI-EVENT-v1` emitters
- ✅ Deterministic `canonicalizePacket` + `sourceChecksum`
- ✅ ScrollEditorToolbar scene factory + golden fixture
- ✅ DOM adapter (`renderSceneToDomSpec`) + removable WAND ornament slot
- ✅ PB-UI / PB-LAYOUT diagnostics (`validateComposeScene`)
- ✅ `compose:migrate:toolbar` flag + `ComposeScrollEditorToolbar` React shell
- ✅ Live `IDEChrome` TopBar action-cluster swap (opt-in via `compose:migrate:toolbar`)

See [MIGRATION_GUIDE.md](./MIGRATION_GUIDE.md) and packet API in `packets.ts`.

## Update Ledger Pilot: ✅ Always-on Compose

The Landing twin-gate Update Ledger (`UpdateLedgerWindow`) is the second Compose pilot. Unlike the toolbar, it is **always-on** — no feature flag gates the primary render path.

- ✅ `createUpdateLedgerScene({ entryCount })` → `PB-UI-SCENE-v1` (`kind: update-ledger-window`)
- ✅ Anatomy slots: `header` (rain title + status chip), `boot` (CLI lines), `scroll` (entry list)
- ✅ React shell: `ComposeUpdateLedger` — scene → `renderSceneToDomSpec`, slot hosts, `DigitalRainText`
- ✅ DivWand fallback only when `validateComposeScene` fails (safe path, not A/B)
- ✅ Golden fixture: `tests/qa/features/fixtures/update-ledger-window.pb-ui-scene.v1.json`
- ✅ Reduced motion: plain title text, boot lines immediate, no entry stagger

**Packet API (`packets.ts`):**

```ts
import {
  createUpdateLedgerScene,
  createUpdateLedgerDefinition,
  UPDATE_LEDGER_KIND,
  registerUpdateLedgerMigration,
} from 'src/core/compose/packets';

const scene = createUpdateLedgerScene({ entryCount: 12 });
// optional WAND ornament (off by default on landing):
// createUpdateLedgerScene({ entryCount: 12, includeWandOrnament: true });
```

Public host: `src/pages/Landing/UpdateLedgerWindow.jsx` → `ComposeUpdateLedger`. Migration tracking via `registerUpdateLedgerMigration()`; `COMPOSE_FLAGS.MIGRATE_LEDGER` exists for registry only, not rollout.

## Enter Portal Pilot: ✅ Always-on Compose

The Landing twin-gate Enter orb is the third Compose pilot — also **always-on** (no render flag).

- ✅ `createEnterPortalScene()` → `PB-UI-SCENE-v1` (`kind: enter-portal-button`)
- ✅ Anatomy parts: `hit-target`, `rings`, `content`
- ✅ React shell: `ComposeEnterPortal` — press/focus polish, `PORTAL.ENTER` / `PORTAL.FOCUS`
- ✅ Legacy markup fallback only when `validateComposeScene` fails
- ✅ Landing CSS: compositor-friendly press scale, energy ring, reduced-motion
- ✅ Golden: `tests/qa/features/fixtures/enter-portal-button.pb-ui-scene.v1.json`

```ts
import {
  createEnterPortalScene,
  createEnterPortalDefinition,
  ENTER_PORTAL_KIND,
  registerEnterPortalMigration,
} from 'src/core/compose/packets';

const scene = createEnterPortalScene();
```

Public host: `LandingPage.jsx` → `ComposeEnterPortal`. Storm canvas + WatercolorDissolve stay outside the packet.

## Galaxy Backdrop Pilot: ✅ Always-on Compose

The Landing twin-gate storm galaxy is the fourth Compose pilot — also **always-on** (no render flag).

- ✅ `createGalaxyBackdropScene()` → `PB-UI-SCENE-v1` (`kind: galaxy-backdrop`)
- ✅ Parts: `galaxy-plate`, `storm-overlay`
- ✅ Shell: `ComposeGalaxyBackdrop` — compositor plate rotate + full storm overlay (`skipGalaxyPlate`)
- ✅ Fallback: single-canvas `StormCanvas` if validate fails
- ✅ Golden: `tests/qa/features/fixtures/galaxy-backdrop.pb-ui-scene.v1.json`

```ts
import {
  createGalaxyBackdropScene,
  createGalaxyBackdropDefinition,
  GALAXY_BACKDROP_KIND,
  registerGalaxyBackdropMigration,
} from 'src/core/compose/packets';

const scene = createGalaxyBackdropScene();
```

Public host: `LandingPage.jsx` → `ComposeGalaxyBackdrop`. WatercolorDissolve + twin gates stay outside the packet.

## Read Chrome Pilot: ✅ Always-on Compose

The Read IDE TopBar/StatusBar chrome is the fifth Compose pilot — **always-on** (no render flag), GrimDesign-beautified.

- ✅ `createReadTopBarScene()` / `createReadStatusBarScene()` → `PB-UI-SCENE-v1` (`kind: read-top-bar` / `read-status-bar`)
- ✅ Anatomy: top bar `identity` / `progression` / `actions`; status bar `vitals` / `position` — both labelled `region` landmarks (banner/contentinfo are unlawful nested in the app shell)
- ✅ React shells: `ComposeReadChrome.tsx` — region content stays in UI-owned `IDEChrome.jsx`; legacy markup fallback only when `validateComposeScene` fails
- ✅ GrimDesign harmonic seam: `native-dom` visual attachment (`grim-harmonic-seam`), WILL/HARMONIC signal — 1600ms opacity breathe shared by both seams and the Ready dot, colors via `--ritual-*` school variables, reduced-motion stilled
- ✅ Volatile text (title, XP, Ln/Col, syllables) is runtime React content — packets stay static and golden-stable
- ✅ Goldens: `tests/qa/features/fixtures/read-top-bar.pb-ui-scene.v1.json`, `read-status-bar.pb-ui-scene.v1.json`

```ts
import {
  createReadTopBarScene,
  createReadStatusBarScene,
  registerReadChromeMigration,
} from 'src/core/compose/packets';
```

Public host: `src/pages/Read/IDEChrome.jsx` → `ComposeReadTopBar` / `ComposeReadStatusBar`. The flag-gated `compose:migrate:toolbar` action-cluster swap still lives inside the `actions` region. `COMPOSE_FLAGS.MIGRATE_READ_CHROME` exists for registry tracking only, not rollout.

## Oracle Terminal Pilot: ✅ Always-on Compose

The Lexicon Oracle (SearchPanel) is the sixth Compose pilot — **always-on**, and the vehicle for the Arcane Terminal redesign (Oracle is a terminal; Leximancy is the search engine).

- ✅ `createOracleTerminalScene()` → `PB-UI-SCENE-v1` (`kind: oracle-terminal`)
- ✅ Anatomy: `session` (TTY line + tmux-style numbered mode tabs) / `prompt` (borderless command line) / `signal` (bracketed statusline) / `feed` — complexity 4 per GrimDesign signal
- ✅ Shell: `ComposeOracleTerminal.tsx` — SearchPanel keeps logic/markup, regions tagged `data-compose-part`; legacy glass skin is the validation-failure fallback
- ✅ Multi-instance safe: packet ids never become DOM ids; landmark label suffixed with the per-mount input id (`landmark-unique` clean with two instances)
- ✅ De-glassed: CRT convex overlay, arcane reflection streak, and macOS traffic-light dots removed; square opaque frame, gold=chrome / school=phosphor
- ✅ Scanline atmosphere is a removable `native-dom` attachment — `:has()` gates the `::before` scanlines on the attachment node; school scanline variants unchanged
- ✅ Beacon breathes at the shared 1600ms harmonic (same frequency as the Read chrome seams)
- ✅ Golden: `tests/qa/features/fixtures/oracle-terminal.pb-ui-scene.v1.json`

```ts
import {
  createOracleTerminalScene,
  registerOracleTerminalMigration,
} from 'src/core/compose/packets';
```

Public host: `src/pages/Read/SearchPanel.jsx`. `COMPOSE_FLAGS.MIGRATE_ORACLE` exists for registry tracking only, not rollout.

## Phase 9 Status: ✅ Production Integration

- ✅ React wrappers (`ComposeScrollEditorToolbar`, `ComposeButton`)
- ✅ `IDEChrome` TopBar live swap behind `compose:migrate:toolbar`
- ✅ Toolbar bridge (`toolbar-bridge.ts`) maps visibility + `TOOLBAR.*` → host handlers
- ✅ Perf: memoized scene→DOM, filtered action tree, `useSyncExternalStore` flag hook
- ✅ Consumer docs (this section + Migration Guide Phase 9)

**Enable in a session (devtools / tests):**

```ts
import { featureFlags, COMPOSE_FLAGS } from 'src/core/compose/flags';
featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
```

Default remains OFF. Classic icon TopBar is the fallback.

## Phase 10 Status: ✅ Advanced Rendering (Skia skipped)

Decision: **Skia WASM is not necessary** for compose value. Phase 10 ships contracts without a CanvasKit binary.

- ✅ `negotiateRenderer` / `negotiateSceneCapabilities` (`PB-UI-006` / `PB-UI-007` / `PB-RENDER-*`)
- ✅ Hybrid DOM hosts for WAND slots (`mountHybridAttachment`) with Canvas 2D paint when available
- ✅ `probeSkiaAdapter` / `probeVelloAdapter` — always unavailable; `loadsWasm: false`
- ✅ `compareSemanticGeometry` tolerance checks (visual regression contract)
- ✅ `compose:render` gates hybrid paint inside `ComposeScrollEditorToolbar`

```ts
import { featureFlags, COMPOSE_FLAGS } from 'src/core/compose/flags';
featureFlags.enable(COMPOSE_FLAGS.MIGRATE_TOOLBAR);
featureFlags.enable(COMPOSE_FLAGS.RENDER); // hybrid attachment paint
```

## Phase 11 Status: ✅ Advanced Validation

- ✅ `auditComposeA11y` / `formatA11yAuditSummary` (axe-core → diagnostics)
- ✅ Vitest: `tests/qa/features/compose-phase11-a11y.test.tsx`
- ✅ Playwright: `tests/visual/compose-toolbar-a11y.spec.js` (axe + screenshot)
- ✅ npm scripts: `ui:a11y:test`, `ui:contracts:test`, `ui:layout:test`, `ui:render:test`, …
- ✅ CI: `.github/workflows/test.yml` runs compose a11y + contract suites

Playwright enables the toolbar via `window.__COMPOSE_FLAGS__` (devtools only; not a production rollout).

## Overview

The Composed Component Architecture implements the PDR (Product Design Record) for a modern, accessible UI component system. It separates concerns across five distinct layers:

1. **Meaning** (Semantic Schema) - SCDL + JSON Schema 2020-12
2. **Anatomy** (Component Vocabulary) - Open UI + WAI-ARIA
3. **Placement** (Layout) - Taffy + Cassowary
4. **Behavior** (State Machines) - Zag.js + XState
5. **Appearance** (Rendering) - DOM + Skia + WAND

## Architecture Layers

### 1. Semantic Schema Layer (`src/core/compose/schema/`)

Defines TypeScript contracts for component semantics using SCDL-inspired declarative schemas.

**Key Types:**
- `ComponentRole` - Semantic purpose (button, checkbox, tabs, etc.)
- `ComponentState` - Interaction state (disabled, focused, selected, etc.)
- `ComponentAnatomy` - Semantic parts that make up the component
- `ComponentSchema` - Complete semantic definition
- `ComponentInstance` - Rendered component with state

**Features:**
- JSON Schema validation (draft-07)
- Schema registry for managing component definitions
- Compile-time TypeScript validation
- Runtime schema validation

**Example:**
```typescript
import { schemaRegistry, type ComponentSchema } from './schema/ComponentSchema';

const buttonSchema: ComponentSchema = {
  id: 'my:button',
  name: 'Button',
  role: 'button',
  initialState: { disabled: false, focused: false },
  anatomy: {
    id: 'root',
    role: 'button',
    interactive: true,
    visible: true,
    children: [
      { id: 'label', role: 'text', interactive: false, visible: true }
    ]
  },
  accessibility: {
    ariaRole: 'button',
    keyboard: ['Enter: activates', 'Space: activates']
  }
};

schemaRegistry.register(buttonSchema);
```

### 2. Component Vocabulary Layer (`src/core/compose/vocabulary/`)

Provides established anatomy, states, roles, and interaction expectations for common UI components based on Open UI + WAI-ARIA.

**Pre-defined Components:**
- Button
- Checkbox
- Switch
- Tabs
- Dialog
- Input
- Slider
- Tooltip

**Features:**
- WAI-ARIA compliant anatomy
- Keyboard interaction patterns
- Accessibility requirements
- Screen reader announcements

**Example:**
```typescript
import { registerVocabulary, getVocabularyByRole } from './vocabulary';

// Register all vocabulary schemas
registerVocabulary();

// Get button schema
const buttonSchema = getVocabularyByRole('button');
```

### 3. Layout Layer (`src/core/compose/layout/`)

Handles component placement using Taffy (flex/grid/block) and Cassowary (constraint-based) layout engines.

**Layout Algorithms:**
- **Flex** - Row/column layouts with gap and alignment
- **Grid** - 2D grid layouts
- **Block** - Vertical stacking
- **Constraint** - Proportional, alignment, and priority-based layouts

**Features:**
- Taffy adapter for CSS-like layouts
- Cassowary solver for complex constraints
- Automatic routing based on layout intent
- Padding, gap, and alignment support

**Example:**
```typescript
import { LayoutEngine, type LayoutNode } from './layout';

const engine = new LayoutEngine();
const root: LayoutNode = {
  id: 'root',
  intent: { algorithm: 'flex', direction: 'row', gap: 10 },
  children: [
    { id: 'child1', intent: { algorithm: 'block' } },
    { id: 'child2', intent: { algorithm: 'block' } }
  ]
};

const result = engine.compute(root, 400, 200);
```

### 4. Behavior Layer (`src/core/compose/behavior/`)

Framework-independent, headless state machines for accessible UI widgets (Zag.js-inspired).

**Pre-defined Machines:**
- Button (focus, hover, press, loading)
- Checkbox (toggle, disabled)
- Switch (on/off)
- Tabs (navigation, selection)
- Dialog (open, close, toggle)

**Features:**
- State transitions with guards
- Actions during transitions
- Event-driven state changes
- Subscriber pattern for state updates
- Framework-agnostic

**Example:**
```typescript
import { createBehaviorService, createButtonMachine } from './behavior';
import { buttonSchema } from './vocabulary';

const service = createBehaviorService(buttonSchema, {}, {
  click: () => console.log('Clicked!')
});

service.subscribe((state) => {
  console.log('State changed:', state);
});

service.send({ type: 'focus' });
service.send({ type: 'click' });
```

### 5. Workflow Layer (`src/core/compose/workflow/`)

Hierarchical statecharts and event-driven orchestration for application workflows (XState-inspired).

**Pre-defined Workflows:**
- Navigation (idle, navigating, error)
- Form submission (editing, validating, submitting, success)

**Features:**
- Hierarchical states
- Parallel states
- Guarded transitions
- Actions (assign, send, raise, log, invoke)
- Service invocation

**Example:**
```typescript
import { createWorkflowService, createNavigationWorkflow } from './workflow';

const workflow = createNavigationWorkflow();
const service = createWorkflowService(workflow);

service.subscribe((state) => {
  console.log('Workflow state:', state);
});

service.send({ type: 'NAVIGATE', payload: { route: '/about' } });
```

### Theme suites

Dark and light Compose palettes live as DTCG JSON under `tokens/compose/themes/` (`dark.json`, `light.json`). Regenerate checked-in CSS after editing either file:

```bash
npm run generate:compose-themes
```

Output: `src/lib/css/generated/compose-themes.css` (`[data-theme='dark']` / `[data-theme='light']` blocks plus public aliases like `--bg-void`). `ThemeProvider` (`src/hooks/useTheme.jsx`) sets `document.documentElement` `data-theme`; `ThemeToggle` in the nav rail switches between suites.

### 6. Design Tokens Layer (`src/core/compose/tokens/`)

Cross-platform token interchange using DTCG format with Style Dictionary-compatible output.

**Token Categories:**
- Colors (primary, neutral, semantic)
- Spacing (xs, sm, md, lg, xl, 2xl, 3xl)
- Typography (fontFamily, fontSize, fontWeight, lineHeight)
- Border radius
- Shadows

**Features:**
- Token references and aliases
- Resolution caching
- Flat token map generation
- Extensible token structure

**Example:**
```typescript
import { getToken, getAllTokens } from './tokens';

const primaryColor = getToken('color.primary.500');
const allTokens = getAllTokens();
```

### 7. Scene Graph Layer (`src/core/compose/scene/`)

WAND-inspired scene graph that keeps geometry and material meaning independent from the renderer.

**Node Types:**
- Container, Rectangle, Circle, Ellipse, Path
- Text, Image, Group, Component

**Features:**
- Fluent builder API
- Material properties (fill, stroke, opacity, shadow, gradient)
- Geometric transformations (translate, rotate, scale)
- Accessibility attributes
- Layout-to-scene conversion

**Example:**
```typescript
import { createSceneBuilder } from './scene';

const scene = createSceneBuilder()
  .container('root', { width: 400, height: 200 })
  .enter('root')
  .rectangle('box', { 
    x: 10, y: 10, width: 100, height: 50,
    material: { fill: '#3b82f6', borderRadius: 8 }
  })
  .text('label', 'Hello', { x: 20, y: 30 })
  .exit()
  .build();
```

### 8. Renderer Layer (`src/core/compose/render/`)

Primary DOM renderer with Canvas/Skia stubs for future GPU acceleration.

**Render Targets:**
- **DOM** (primary) - HTML elements with CSS styling
- **Canvas** - HTML5 Canvas 2D context
- **Skia** (future) - Production geometry rendering
- **WebGL** (future) - GPU-accelerated rendering

**Features:**
- Scene graph to DOM conversion
- Material application (colors, gradients, shadows)
- Transform application
- Accessibility attributes
- High-DPI support

**Example:**
```typescript
import { createRenderer } from './render';

const renderer = createRenderer('dom');
renderer.render(scene, {
  target: 'dom',
  container: document.getElementById('app'),
  accessibility: true
});
```

### 9. Validation Layer (`src/core/compose/validate/`)

Accessibility, structural, and contract validation using axe-core-inspired rules.

**Built-in Rules:**
- Accessible name (WCAG 4.1.2)
- Keyboard interaction (WCAG 2.1.1)
- Unique IDs
- Valid dimensions
- Color contrast (placeholder)

**Features:**
- Extensible rule system
- Severity levels (error, warning, info)
- WCAG criterion mapping
- Validation context
- Performance measurement

**Example:**
```typescript
import { validateComponent, validateScene } from './validate';

const result = validateComponent(buttonSchema);
if (!result.passed) {
  console.error('Validation failed:', result.issues);
}
```

## Feature Flag

The Compose architecture is behind a feature flag to allow gradual rollout:

```typescript
import { isComposeEnabled, enableCompose, disableCompose } from './index';

if (!isComposeEnabled()) {
  enableCompose();
}
```

## Testing

All layers have comprehensive test coverage:

```bash
# Run all Compose tests
npx vitest run tests/qa/features/compose-*.test.ts

# Run specific layer tests
npx vitest run tests/qa/features/compose-schema.test.ts
npx vitest run tests/qa/features/compose-vocabulary.test.ts
npx vitest run tests/qa/features/compose-layout.test.ts
npx vitest run tests/qa/features/compose-behavior.test.ts
npx vitest run tests/qa/features/compose-validation.test.ts
```

**Test Coverage:**
- 69 tests across 5 test files
- Schema layer: Registry, JSON Schema validation
- Vocabulary layer: Component definitions, registration
- Layout layer: Flex, grid, block, constraints
- Behavior layer: State machines, transitions, guards
- Validation layer: Rules, accessibility, structure

## Implementation Status

### Phase 1: Semantic Schema + Component Vocabulary ✅
- [x] TypeScript types for component schemas
- [x] JSON Schema validation (draft-07)
- [x] Schema registry
- [x] 8 pre-defined component vocabularies
- [x] WAI-ARIA compliance
- [x] Comprehensive tests

### Phase 2: Layout (Taffy + Cassowary) ✅
- [x] Taffy adapter (flex, grid, block)
- [x] Cassowary solver (constraints)
- [x] Layout engine with automatic routing
- [x] Padding, gap, alignment support
- [x] Comprehensive tests

### Phase 3: Behavior (Zag.js) ✅
- [x] Behavior service with state machine
- [x] 5 pre-defined widget machines
- [x] Guards and actions
- [x] Subscriber pattern
- [x] Comprehensive tests

### Phase 4: Workflow (XState) ✅
- [x] Workflow service with statecharts
- [x] 2 pre-defined workflows
- [x] Hierarchical states
- [x] Actions (assign, send, raise, log, invoke)
- [x] Comprehensive tests

### Phase 5: Design Tokens (DTCG) ✅
- [x] Token resolver with references
- [x] Default token set
- [x] Flat token map generation
- [x] Comprehensive tests

### Phase 6: Scene Graph (WAND) ✅
- [x] Scene builder with fluent API
- [x] Material and transform support
- [x] Layout-to-scene conversion
- [x] Comprehensive tests

### Phase 7: Renderer (DOM + Skia) ✅
- [x] DOM renderer (primary)
- [x] Canvas renderer (stub)
- [x] Material application
- [x] Transform application
- [x] Accessibility support

### Phase 8: Validation ✅
- [x] Validation engine
- [x] 5 built-in rules
- [x] WCAG mapping
- [x] Comprehensive tests

## Future Work

### Phase 9: Production Integration ✅
- [x] React component wrappers
- [x] Integration with existing UI (`IDEChrome` TopBar)
- [x] Performance optimization (memo + flag store subscription)
- [x] Documentation (README + Migration Guide)

### Phase 10: Advanced Rendering ✅
- [x] Skia WASM **skipped** (stub only — no CanvasKit binary)
- [x] Vello kept experimental / unshipped (stub probe)
- [x] Hybrid DOM/Canvas attachment hosts + capability negotiation
- [x] Semantic geometry parity fixtures (not pixel snapshots)

### Phase 11: Advanced Validation ✅
- [x] axe-core integration (`auditComposeA11y` → `PB-UI-008`)
- [x] Playwright visual snapshots (`compose-toolbar-a11y.spec.js`)
- [x] Automated accessibility audits (vitest jest-axe + Playwright AxeBuilder)
- [x] CI/CD integration (`ui:a11y:test` + compose contract jobs in `test.yml`)

## References

- [PDR Document v2](../../../docs/scholomance-encyclopedia/PDR-archive/PDR-2026-07-19-COMPOSED-COMPONENT-ARCHITECTURE-V2.md)
- [SCDL Compiler White Paper](docs/scholomance-encyclopedia/SCDL/)
- [WAND Chibi PIR](docs/scholomance-encyclopedia/PIRs/)
- [Open UI](https://open-ui.org/)
- [WAI-ARIA](https://www.w3.org/WAI/ARIA/)
- [Zag.js](https://zagjs.com/)
- [XState](https://xstate.js.org/)
- [DTCG Token Format](https://design-tokens.github.io/community-group/format/)

## License

Part of the Scholomance project. See main repository for license details.
