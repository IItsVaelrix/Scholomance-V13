# PDR: Composed Component Architecture v2

**Subtitle:** A deterministic, renderer-agnostic semantic UI system where SCDL defines component intent, DivWand carries composition and layout intent, adapters supply behavior and target-specific layout, and WAND/SCDL geometry attach procedural appearance without displacing DOM accessibility.

**Status:** Approved — phased implementation in progress (`src/core/compose/`)  
**Version:** 2.1  
**Date:** 2026-07-19 (rev 2.1 closes open decisions + contract stubs)  
**Classification:** Architectural · Structural · Behavioral · Rendering · Accessibility  
**Priority:** High  
**Primary Goal:** Replace ad-hoc coupling between semantic meaning, layout, behavior, and appearance with explicit, independently testable contracts while preserving React, DOM accessibility, existing SCDL geometry behavior, and incremental migration safety.

**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-COMPOSED-COMPONENT-ARCH-V2`  
**Living implementation:** `src/core/compose/` (not `src/core/ui-schema/` — that path in §18 is the conceptual map; compose is the shipped home)

---

## 1. Executive Summary

Scholomance currently contains several mature but partially overlapping systems:

- **SCDL** compiles semantic geometry and scene programs.
- **SemQuant** resolves canonical meaning and provenance.
- **DivWand** describes and renders UI composition trees.
- **WAND** evaluates bounded procedural visual formulas.
- **React + DOM + CSS** host the accessible web interface.
- Existing pages independently manage layout, widget state, workflow state, tokens, and visual ornamentation.

This PDR formalizes these systems into a composed component architecture with five independent chambers:

1. **Meaning:** What is the component?
2. **Anatomy:** What semantic parts and accessibility obligations does it contain?
3. **Placement:** What layout intent does it declare?
4. **Behavior:** What events, local widget states, and application workflows govern it?
5. **Appearance:** What tokens, WAND formulas, SCDL assets, and renderer-specific materials express it?

The architecture introduces four canonical contracts:

- `SCHOL-COMPONENT-DEFINITION-v1`
- `PB-UI-SCENE-v1`
- `PB-LAYOUT-v1`
- `PB-UI-EVENT-v1`

External technologies remain replaceable adapters:

- Native CSS is the web flow-layout authority.
- Taffy is the non-DOM flow-layout authority and optional web shadow evaluator.
- Cassowary is an opt-in constraint-region solver, not a global layout dependency.
- Zag.js is the preferred adapter for reusable accessible composite widgets.
- XState orchestrates application workflows but does not replace React Router.
- WAND supplies procedural visual attachments.
- SCDL scene assets supply geometric attachments.
- Skia is an optional creative-rendering backend.
- Vello remains a future experimental backend.

The architecture migrates eligible components incrementally. Trivial native components are not forced through the full stack.

---

## 2. Problem Statement

Current React surfaces often combine several responsibilities inside the same component:

```text
semantic role
+ DOM structure
+ state hooks
+ keyboard behavior
+ CSS layout
+ visual tokens
+ canvas geometry
+ cross-panel workflow
```

This causes hidden coupling:

- A layout refactor can break keyboard behavior.
- A visual redesign can degrade semantic structure.
- Widget-local state can become entangled with page workflows.
- Canvas and DOM implementations can drift without a shared contract.
- Similar component anatomy is repeatedly reconstructed.
- Renderer-specific data can leak into canonical authoring structures.
- Validation occurs late, after JSX and runtime behavior are already intertwined.

The goal is not to eliminate React components. The goal is to make them adapters over explicit semantic and behavioral contracts.

---

## 3. Architectural Principles

### 3.1 One authority per concern

Each target and concern has exactly one authoritative implementation:

| Concern | Canonical authority |
|---|---|
| Component meaning | `SCHOL-COMPONENT-DEFINITION-v1` |
| UI composition | `PB-UI-SCENE-v1` |
| Layout intent | `PB-LAYOUT-v1` |
| Widget event protocol | `PB-UI-EVENT-v1` |
| Web semantic tree | DOM |
| Web flow layout | Native CSS |
| Non-DOM flow layout | Taffy |
| Constraint layout | Cassowary, inside declared constraint regions |
| Widget behavior | Behavior contract, usually adapted through Zag |
| App workflow | XState machine or equivalent workflow adapter |
| Browser navigation | React Router |
| Procedural appearance | WAND |
| Geometric asset appearance | SCDL scene graph |
| Token source | DTCG-compatible token source |
| Diagnostics | PB-ERR-compatible compiler and adapter diagnostics |

### 3.2 Canonical packets contain intent, not library objects

Canonical data must never serialize:

- DOM nodes
- React elements
- Zag machine instances
- XState actors
- Taffy node handles
- Cassowary variable instances
- Skia paints or canvases
- Vello scene objects

These are runtime adapter concerns.

### 3.3 Native platform capabilities remain preferred

Native HTML and CSS remain lawful when they satisfy the contract:

```jsx
<button type="button">Save</button>
```

A component does not require Zag, XState, Taffy, Cassowary, WAND, or Skia merely because those systems exist.

### 3.4 Determinism applies to canonical computation

The same semantic definition, scene packet, layout intent, viewport constraints, and event sequence must produce the same normalized output.

Platform rasterization and text rendering may vary within declared tolerance. Byte identity is required for canonical packets and normalized computational results, not for every browser pixel.

### 3.5 Every boundary has an adapter and contract test

No library is imported directly into semantic contracts. Each technology lives behind a narrow adapter with deterministic fixtures.

---

## 4. Goals

- Define portable UI component meaning independently from React.
- Evolve DivWand into the canonical UI composition tree.
- Preserve SCDL geometry and scene-graph contracts.
- Preserve WAND as a procedural visual formula system.
- Keep DOM + CSS as the accessibility-first web target.
- Permit non-DOM rendering without rewriting semantic components.
- Separate widget-local behavior from application workflow orchestration.
- Generate platform tokens from one source of truth.
- Extend PB-ERR diagnostics across schema, layout, event, and rendering seams.
- Migrate components incrementally behind feature flags.
- Avoid mandatory ceremony for trivial native components.

---

## 5. Non-Goals

- Replacing React.
- Replacing React Router.
- Replacing SCDL's existing geometry grammar.
- Making WAND the root UI composition graph.
- Running all web layouts through Taffy.
- Requiring Cassowary for ordinary responsive layouts.
- Requiring Zag for every `useState`.
- Requiring XState for every conditional.
- Rendering ordinary text, forms, or document UI through Skia.
- Achieving pixel-identical DOM and Skia text rendering.
- Migrating all components in one release.
- Building mobile-native adapters in this PDR.
- Adopting Vello as a production dependency.
- Serializing runtime-library objects into canonical packets.

---

## 6. Change Classification

| Classification | Rationale |
|---|---|
| **Architectural** | Introduces canonical UI scene, layout, event, and component-definition contracts. |
| **Structural** | Adds registries, adapters, compiler passes, generated tokens, and contract tests. |
| **Behavioral** | Eligible widgets and workflows move to explicit machine contracts while preserving observable behavior. |
| **Cosmetic** | Token source changes may alter authoring locations, but intended output remains visually stable. |

---

## 7. System Boundaries

### 7.1 SCDL

SCDL remains the compiler family and deterministic authoring lineage.

This PDR does not overload the pixel-geometry grammar with widget-specific syntax. UI semantics use one of two lawful front ends:

1. **SCDL-UI sibling dialect**, sharing tokenizer, diagnostics, source spans, checksums, and semantic infrastructure.
2. **Canonical JSON component definitions**, consumed directly by the UI semantic compiler.

**Resolved (D-1):** Canonical JSON / TypeScript component definitions are the **primary** authoring surface for v1. An SCDL-UI sibling dialect remains a lawful future front end that must lower into the same contracts; it is not required to ship Phase 1.

### 7.2 SemQuant

SemQuant resolves:

- role aliases
- component kinds
- semantic part names
- material and token aliases
- event names
- accessibility vocabulary
- provenance

SemQuant does not compute layout, run machines, or render output.

### 7.3 DivWand

DivWand evolves into the canonical UI composition system.

DivWand owns:

- semantic component nodes
- named slots
- nested UI regions
- layout intent references
- visual attachment references
- adapter capability requirements
- inspector and diagnostics metadata

DivWand does not own widget state machines or application workflows.

### 7.4 WAND

WAND remains a bounded procedural visual formula system.

WAND owns:

- procedural geometry formulas
- material formulas
- visual role dispatch
- deterministic formula identity
- ornamentation
- sigils
- effects
- decorative chrome
- canvas-oriented procedural visuals

WAND does not own semantic DOM structure, focus order, or UI composition.

### 7.5 SCDL geometry scene graph

SCDL scene assets remain the source for:

- geometric assets
- instanced scenes
- materialized pixel or vector programs
- exported visual artifacts
- renderer-independent geometric attachments

### 7.6 DOM + CSS

The browser owns:

- accessibility tree
- native controls
- text layout
- selection
- forms
- browser history integration
- responsive flow layout
- intrinsic sizing
- focus scrolling

### 7.7 Taffy

Taffy owns CSS-like flow computation only where native CSS is unavailable:

- Skia surfaces
- canvas renderers
- game-engine adapters
- export layouts
- optional web shadow comparisons

### 7.8 Cassowary

Cassowary owns explicit relational constraint regions only.

Cassowary is not activated implicitly. A component must declare:

```json
{
  "mode": "constraint"
}
```

Constraint regions are limited, diagnosable, and bounded.

### 7.9 Zag.js

Zag is the preferred widget adapter for reusable composite controls when an applicable machine exists.

Examples:

- tabs
- menus
- dialogs
- comboboxes
- toolbars
- accordions
- popovers
- selectable collections

Native elements remain preferred for simple controls.

### 7.10 XState

XState owns application workflows such as:

- combat phases
- onboarding
- multi-step editing
- cross-panel orchestration
- asynchronous actor lifecycles
- recovery workflows

React Router remains the URL and history authority.

---

## 8. Canonical Contracts

## 8.1 Component Definition Contract

```typescript
interface ScholComponentDefinitionV1 {
  contract: "SCHOL-COMPONENT-DEFINITION-v1";
  version: "1.0.0";
  kind: string;
  description?: string;

  anatomy: {
    rootRole: string;
    parts: ComponentPartDefinition[];
    slots?: SlotDefinition[];
  };

  states: StateDefinition[];
  events: EventDefinition[];
  accessibility: AccessibilityContract;

  capabilities?: CapabilityRequirement[];
  defaultLayout?: LayoutIntentRef;
  defaultVisuals?: VisualAttachmentRef[];

  provenance: ProvenanceRecord;
}
```

This document defines a component kind. It is not the same as a JSON Schema that validates component instances.

### Supporting types (definition completeness)

```typescript
type JsonValue =
  | string | number | boolean | null
  | JsonValue[]
  | { [key: string]: JsonValue };

interface ComponentPartDefinition {
  id: string;
  role: string;
  label?: string;
  description?: string;
  interactive?: boolean;
  visible?: boolean;
  required?: boolean;
  children?: ComponentPartDefinition[];
}

interface SlotDefinition {
  name: string;
  accepts: string[];           // kind or role globs
  required?: boolean;
  maxChildren?: number;
}

interface StateDefinition {
  name: string;
  type: "boolean" | "string" | "number" | "enum";
  enumValues?: string[];
  default?: JsonValue;
  ariaMapping?: string;        // e.g. "aria-expanded"
}

interface EventDefinition {
  type: string;                // e.g. "TOOLBAR.FOCUS_NEXT"
  payloadSchemaId?: string;    // optional JSON Schema $id
  bubbles?: boolean;
}

interface AccessibilityContract {
  ariaRole: string;
  requiredAttributes?: string[];
  keyboard: string[];          // human-readable obligations
  announcements?: string[];
  focusRetention?: "restore" | "trap" | "none";
  nameFrom?: "contents" | "author" | "none";
}

interface CapabilityRequirement {
  id: string;                  // e.g. "focusable-controls"
  required: boolean;
}

interface LayoutIntentRef {
  layoutId: string;            // key into PbUiSceneV1.layouts
}

interface VisualAttachmentRef {
  visualId: string;            // key into PbUiSceneV1.visuals
}

interface ProvenanceRecord {
  sourceKind: "json" | "typescript" | "scdl-ui" | "migrated";
  sourcePath?: string;
  contentHash: string;         // scd64 or sha256 hex
  author?: string;
  establishedAt: string;       // ISO-8601
}
```

## 8.2 Component Instance Schema

Each component kind may publish a JSON Schema 2020-12 instance schema:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "scholo://component-instance/toolbar/v1",
  "type": "object",
  "properties": {
    "kind": { "const": "toolbar" },
    "id": { "type": "string", "minLength": 1 },
    "orientation": {
      "enum": ["horizontal", "vertical"]
    },
    "disabled": { "type": "boolean" }
  },
  "required": ["kind", "id"],
  "additionalProperties": false
}
```

## 8.3 UI Scene Contract

```typescript
interface PbUiSceneV1 {
  contract: "PB-UI-SCENE-v1";
  version: "1.0.0";
  id: string;
  root: UiSceneNode;
  definitions: Record<string, ScholComponentDefinitionV1>;
  layouts: Record<string, PbLayoutV1>;
  visuals: Record<string, VisualAttachment>;
  sourceChecksum: string;
}

interface UiSceneNode {
  id: string;
  kind: string;
  role?: string;
  props?: Record<string, JsonValue>;
  state?: Record<string, JsonValue>;
  layoutRef?: string;
  visualRefs?: string[];
  slots?: Record<string, UiSceneNode[]>;
  children?: UiSceneNode[];
}
```

### UI scene identity law

The packet identity is derived from canonical serialization of:

- definitions used by the scene
- normalized scene nodes
- layout intent
- visual attachment references
- source checksum policy

Runtime measurements and renderer objects are excluded.

## 8.4 Layout Contract

```typescript
interface PbLayoutV1 {
  contract: "PB-LAYOUT-v1";
  version: "1.0.0";
  mode: "flow" | "grid" | "absolute" | "overlay" | "constraint";
  common?: CommonLayoutIntent;
  flow?: FlowLayoutIntent;
  grid?: GridLayoutIntent;
  absolute?: AbsoluteLayoutIntent;
  overlay?: OverlayLayoutIntent;
  constraint?: ConstraintLayoutIntent;
}

interface CommonLayoutIntent {
  paddingPx?: number | [number, number] | [number, number, number, number];
  marginPx?: number | [number, number] | [number, number, number, number];
  minWidthPx?: number;
  maxWidthPx?: number;
  minHeightPx?: number;
  maxHeightPx?: number;
  writingDirection?: "ltr" | "rtl";
}

interface FlowLayoutIntent {
  direction: "row" | "column" | "row-reverse" | "column-reverse";
  gapPx?: number;
  wrap?: boolean;
  align?: "start" | "center" | "end" | "stretch" | "baseline";
  justify?: "start" | "center" | "end" | "space-between" | "space-around" | "space-evenly";
}

interface GridLayoutIntent {
  columns: string;             // CSS grid-template-columns expression
  rows?: string;
  gapPx?: number | [number, number];
  align?: FlowLayoutIntent["align"];
  justify?: FlowLayoutIntent["justify"];
}

interface AbsoluteLayoutIntent {
  xPx: number;
  yPx: number;
  widthPx?: number;
  heightPx?: number;
  zIndex?: number;
}

interface OverlayLayoutIntent {
  anchor: "viewport" | "parent" | { nodeId: string };
  placement: "center" | "top" | "bottom" | "start" | "end";
  offsetPx?: { x?: number; y?: number };
  backdrop?: boolean;
}

interface ConstraintVariableDef {
  id: string;
  initial?: number;
  min?: number;
  max?: number;
}

interface LinearConstraintDef {
  id: string;
  expression: string;          // e.g. "left = parent.left + 8"
  strength: "required" | "strong" | "medium" | "weak";
}
```

### Web lowering law

| Layout mode | Web adapter |
|---|---|
| flow | CSS Flexbox or Block |
| grid | CSS Grid |
| absolute | CSS positioned layout |
| overlay | CSS stacking and positioned regions |
| constraint | Cassowary result applied to a bounded region |

### Non-DOM lowering law

| Layout mode | Non-DOM adapter |
|---|---|
| flow | Taffy |
| grid | Taffy |
| absolute | Direct geometry |
| overlay | Painter-order geometry |
| constraint | Cassowary |

## 8.5 Event Contract

```typescript
interface PbUiEventV1<TPayload = JsonValue> {
  contract: "PB-UI-EVENT-v1";
  version: "1.0.0";
  type: string;
  sourceId: string;
  target?: string;
  payload?: TPayload;
  sequence: number;
  correlationId?: string;
}
```

Examples:

```text
TOOLBAR.FOCUS_NEXT
DIALOG.OPEN
DIALOG.CLOSE
EDITOR.SELECTION_CHANGED
COMBAT.TURN_CONFIRMED
NAV.REQUEST
```

Widget adapters emit events. Workflow adapters consume or transform events. Canonical tests replay event sequences.

## 8.6 Visual Attachment Contract

```typescript
type VisualAttachment =
  | TokenVisualAttachment
  | WandVisualAttachment
  | ScdlAssetAttachment
  | NativeDomVisualAttachment;

interface TokenVisualAttachment {
  kind: "token";
  tokenPath: string;           // DTCG path, e.g. "color.primary.500"
  cssProperty?: string;        // when lowered to DOM, e.g. "background-color"
  placementSlot: string;
}

interface WandVisualAttachment {
  kind: "wand";
  formulaId: string;
  role: string;
  placementSlot: string;
}

interface ScdlAssetAttachment {
  kind: "scdl-asset";
  packetId: string;
  placementSlot: string;
}

interface NativeDomVisualAttachment {
  kind: "native-dom";
  className?: string;
  styleTokens?: string[];      // semantic token aliases → CSS vars
  placementSlot: string;
}
```

Visual attachments never replace semantic anatomy. Removing every attachment must leave an accessible, operable component.

---

## 8.7 Semantic Calculus boundary (kind ≠ permission)

UI composition contracts (`PB-UI-EVENT-v1`, workflow transitions, renderer commands) are **not** Semantic Calculus acts. When a composed surface emits or consumes a SemanticAct (or a bridge that looks like one), these laws are mandatory:

| Concept | Authority | Forbidden drift |
|---|---|---|
| `CalculusKind` (Do / Theory / Clarify / …) | Illocutionary type of the utterance | Must not encode policy verdicts (`Forbidden`, `Escalate` are **not** kinds) |
| `law.decision` (`allow` / `block` / …) | Permission | Must not be inferred from `kind` alone |
| Capability | Archaeology / substrate | Must not invent a capability to make a Do executable |

**Executor gate (when SemanticAct reaches an executor):**

```text
kind === 'Do'
&& law.decision === 'allow'
&& capabilityPresent
```

A blocked delete remains `kind: Do` with `law.decision: block` — the refusal is law, not a kind change.

**Theory / Clarify (annotator discipline):**

- **Theory** iff `bindExact()` returned undefined (unbound concept). Not a catch-all for uncertainty. Never executable; deposits to the theory bank before kind is sealed. No `|| 'stone'` defaults for unbound concepts.
- **Clarify** iff a bound formula has ≥1 unresolved required slot; the question must name that slot. Unbound → Theory, not Clarify. Soft-Do with invented defaults is forbidden.

`PB-UI-EVENT-v1` remains a UI protocol. Bridging into Semantic Calculus requires an explicit adapter that preserves kind/law/capability separation — never collapse them into a single enum.

---

## 9. Schema Sovereignty

### Decision

**Canonical JSON Schema 2020-12 documents are the source of truth for instance validation.**

Generated outputs may include:

- TypeScript types
- runtime validators
- editor hints
- documentation
- test fixtures

Compiler laws handle concerns beyond structural schema expressiveness:

- graph cycles
- unique IDs
- slot compatibility
- event target resolution
- accessibility obligations
- unsupported adapter capabilities
- constraint conflicts
- source provenance
- canonical identity

No hand-written validator may silently diverge from the canonical schema.

---

## 10. Component Eligibility

A component enters the full architecture when it has one or more of these properties:

- reusable composite interaction
- multiple named semantic parts
- non-trivial keyboard behavior
- cross-target rendering
- workflow participation
- reusable layout intent
- procedural visual attachment
- SCDL asset attachment
- accessibility requirements beyond a native primitive
- independently testable state transitions

A component may remain native when it is:

- static text
- a simple native button
- a decorative divider
- a presentational wrapper
- a non-reusable one-state leaf
- a component fully expressed by semantic HTML and CSS

---

## 11. Reference Component Registry

Open UI and WAI-ARIA concepts inform the internal registry, but external vocabularies are not serialized directly.

```typescript
interface ComponentRegistryEntry {
  kind: string;
  anatomyVersion: string;
  parts: RegistryPart[];
  states: RegistryState[];
  events: RegistryEvent[];
  accessibility: AccessibilityContract;
  nativeStrategy: "native" | "composite" | "hybrid";
  preferredBehaviorAdapter?: "zag" | "native" | "custom";
}
```

Initial registry:

- button
- toolbar
- tabs
- dialog
- menu
- popover
- combobox
- accordion
- splitter
- scroll-editor-toolbar
- phoneme-chip
- update-ledger-window
- tactical-board
- combat-command-panel

---

## 12. Rendering Architecture

```text
Component definition
        ↓
PB-UI-SCENE-v1
        ↓
Target renderer
├── DOM renderer
│   ├── semantic HTML
│   ├── CSS layout
│   ├── token styles
│   └── WAND/SCDL attachment hosts
│
├── Skia renderer
│   ├── Taffy layout
│   ├── WAND formula evaluation
│   ├── SCDL geometry rendering
│   └── text-measurement adapter
│
└── Future Vello renderer
    └── same backend interface
```

### Renderer interface

```typescript
interface UiRenderBackend {
  readonly id: string;
  readonly capabilities: RenderCapabilities;

  renderScene(
    scene: PbUiSceneV1,
    environment: RenderEnvironment
  ): RenderResult;

  measureText?(
    request: TextMeasureRequest
  ): TextMeasureResult;

  dispose?(): void;
}
```

### Capability negotiation

A renderer must reject or degrade explicitly when a required capability is unavailable.

Example:

```json
{
  "required": ["semantic-text", "focusable-controls"],
  "optional": ["procedural-glow", "backdrop-blur"]
}
```

The compiler never assumes all backends support all effects.

---

## 13. Layout Architecture

## 13.1 Web flow layout

Native CSS is authoritative.

```typescript
function lowerFlowToCss(intent: FlowLayoutIntent): CSSProperties {
  return {
    display: "flex",
    flexDirection: intent.direction,
    gap: `${intent.gapPx}px`,
    flexWrap: intent.wrap ? "wrap" : "nowrap",
    alignItems: intent.align,
    justifyContent: intent.justify,
  };
}
```

No DOM measurement loop is required for ordinary flow layout.

## 13.2 Taffy shadow mode

Taffy may compute the same layout intent without applying its rectangles.

Shadow reports compare:

- CSS result rectangles
- Taffy result rectangles
- declared tolerance
- intrinsic-size mismatches
- unsupported CSS features

Shadow mode is diagnostic only.

## 13.3 Non-DOM Taffy mode

Taffy becomes authoritative when the target lacks native CSS layout.

Inputs include:

- available size
- normalized intrinsic measurements
- layout intent
- token-resolved spacing
- writing direction
- text measurement results

## 13.4 Constraint regions

Constraint layout is opt-in and bounded.

```typescript
interface ConstraintLayoutIntent {
  regionId: string;
  maxNodes: number;
  maxConstraints: number;
  variables: ConstraintVariableDef[];
  rules: LinearConstraintDef[];
  fallbackLayoutRef: string;
}
```

### Constraint safety laws

- Required constraints may not be silently dropped.
- Soft constraints record violations.
- Invalid or unsolved regions fall back to a declared non-constraint layout.
- Constraint diagnostics identify the dropped or conflicting rule.
- Constraint regions may not span unrelated page roots.
- Cassowary adoption requires three demonstrated layouts that cannot be represented cleanly with existing CSS primitives.

---

## 14. Behavior Architecture

## 14.1 Widget behavior

Widget behavior is local when it affects one semantic component boundary.

Examples:

- open or closed
- selected tab
- highlighted menu item
- roving focus
- disclosure state
- active option
- dialog focus restoration

Preferred implementation order:

1. Native HTML behavior
2. Zag adapter
3. Custom deterministic machine

## 14.2 Application workflow

Workflow state is cross-component or process-oriented.

Examples:

- combat phase progression
- multistep composition
- onboarding
- async export pipeline
- recovery and retry
- page-spanning editor workflows

## 14.3 Router boundary

React Router owns:

- current URL
- browser history
- route matching
- back and forward navigation

Workflow machines may emit:

```text
NAV.REQUEST
```

A navigation adapter executes the router transition and returns:

```text
NAV.COMMITTED
NAV.REJECTED
```

The route is never duplicated as independent machine truth.

## 14.4 Shared-state boundary

Widgets do not mutate workflow actors directly.

```text
Widget event
    ↓
PB-UI-EVENT-v1
    ↓
Workflow adapter
    ↓
Workflow transition
    ↓
Projection or command
    ↓
Widget props/state
```

---

## 15. Design Token Architecture

DTCG-compatible token files become the canonical token source.

```text
tokens/source/*.json
        ↓
schema validation
        ↓
Scholomance transforms
        ↓
├── CSS custom properties
├── JavaScript constants
├── renderer material records
├── Rust structs
├── Godot resources
└── token documentation
```

### Token migration law

- Existing public CSS variable names remain stable during migration.
- Generated output is compared byte-for-byte or value-for-value against existing variables.
- The existing CSS token verification gate remains active.
- Generated files are not manually edited.
- Runtime school themes resolve through semantic aliases rather than hard-coded values.

---

## 16. Diagnostics

New diagnostics must use the existing PB-ERR-compatible system.

Suggested codes:

| Code | Severity | Meaning |
|---|---|---|
| `PB-UI-001` | ERROR | Unknown component kind |
| `PB-UI-002` | ERROR | Duplicate node ID |
| `PB-UI-003` | ERROR | Unknown slot |
| `PB-UI-004` | ERROR | Invalid component instance |
| `PB-UI-005` | ERROR | Event target does not exist |
| `PB-UI-006` | WARN | Optional renderer capability unavailable |
| `PB-UI-007` | ERROR | Required renderer capability unavailable |
| `PB-UI-008` | WARN | Accessibility obligation unresolved |
| `PB-LAYOUT-001` | ERROR | Unsupported layout mode |
| `PB-LAYOUT-002` | ERROR | Constraint region exceeds limits |
| `PB-LAYOUT-003` | WARN | Soft constraint violated |
| `PB-LAYOUT-004` | ERROR | Required constraint conflict |
| `PB-LAYOUT-005` | INFO | Taffy shadow drift exceeds tolerance |
| `PB-EVENT-001` | ERROR | Unknown event type |
| `PB-EVENT-002` | ERROR | Invalid payload |
| `PB-EVENT-003` | WARN | Event ignored in current state |
| `PB-RENDER-001` | ERROR | Renderer failed |
| `PB-RENDER-002` | WARN | Fallback renderer activated |

Every diagnostic includes:

- source node ID
- source span when available
- adapter name
- contract version
- normalized context
- recovery action
- regression seed

---

## 17. Performance Budgets

Budgets are separated by delivery surface.

| Budget | Target |
|---|---:|
| Initial app bundle increase | ≤ 75 KB gzipped |
| Typical widget lazy chunk | ≤ 30 KB gzipped |
| Workflow lazy chunk | ≤ 50 KB gzipped |
| Taffy adapter and WASM | measured separately, lazy where possible |
| Cassowary adapter | lazy and loaded only for constraint regions |
| Skia/CanvasKit | isolated creative-renderer chunk |
| UI scene validation, 200 nodes | < 2 ms median |
| CSS lowering, 200 nodes | < 1 ms median |
| Taffy non-DOM layout, 200 nodes | < 2 ms median |
| Widget transition | < 0.25 ms median |
| Workflow transition | < 1 ms median |
| UI packet canonicalization | < 3 ms for 200 nodes |
| Accessibility | WCAG 2.2 AA target |

Skia size is excluded from the initial application bundle because it is an opt-in renderer asset.

---

## 18. File Map

**Law:** The living home is `src/core/compose/`. The conceptual chambers below map 1:1 onto that tree. Do not create a parallel `src/core/ui-schema/` unless a future rename migration is explicitly approved.

```text
src/core/compose/                          # LIVING HOME
├── README.md
├── MIGRATION_GUIDE.md
├── index.ts
├── flags.ts                               # feature flags (default OFF)
├── migration.ts                           # per-component migration registry
├── schema/
│   ├── contracts.ts                       # SCHOL-* / PB-* contract constants
│   ├── ComponentSchema.ts
│   └── json-schemas.ts                    # JSON Schema (draft-07 → target 2020-12)
├── vocabulary/                            # Open UI + WAI-ARIA presets
├── layout/                                # Taffy + constraint adapters; CSS lowering
├── behavior/                              # Zag-inspired widget machines
├── workflow/                              # XState-inspired app workflows + nav adapter
├── tokens/                                # DTCG source + Style Dictionary transforms
├── scene/                                 # WAND-inspired scene graph (attachments)
├── render/                                # DOM primary; Skia/Canvas stubs
├── validate/                              # a11y + structural validators
└── migrated/                              # pilot components (Button, …)

# Existing systems remain authorities; compose adapters into them:
src/pages/DivWand/**                       # DivWand composition surfaces
# WAND / SCDL geometry packages unchanged — visual attachments only

tests/qa/features/
├── compose-schema.test.ts
├── compose-vocabulary.test.ts
├── compose-layout.test.ts
├── compose-behavior.test.ts
├── compose-validation.test.ts
└── compose-phase1.test.ts
```

Conceptual → living path map:

| PDR chamber | Living path |
|---|---|
| Component definition / registry | `src/core/compose/schema` + `vocabulary` |
| UI scene | `src/core/compose/scene` (+ future `PB-UI-SCENE-v1` emitter) |
| Layout | `src/core/compose/layout` |
| Events / behavior | `src/core/compose/behavior` + `workflow` |
| Tokens | `src/core/compose/tokens` |
| Render backends | `src/core/compose/render` |
| Migration / flags | `src/core/compose/migration.ts`, `flags.ts` |

---

## 19. Ownership

| Path | Owner |
|---|---|
| `src/core/compose/schema/**` | Codex |
| `src/core/compose/vocabulary/**` | Codex / UI |
| `src/core/compose/layout/**` | Layout adapter owner |
| `src/core/compose/behavior/**` | UI behavior owner |
| `src/core/compose/workflow/**` | Workflow owner |
| `src/core/compose/tokens/**` | Codex |
| `src/core/compose/scene/**` | WAND / DivWand boundary |
| `src/core/compose/render/**` | Rendering owner |
| `src/core/compose/validate/**` | UI accessibility owner |
| `src/core/compose/migrated/**` | UI owner of each component |
| `src/pages/DivWand/**` | DivWand owner |
| `tests/qa/features/compose-*.test.ts` | Codex + Gemini |
| Cross-domain contract changes | Angel / repo owner |

No agent may change a canonical contract without updating fixtures and contract tests for every registered adapter.

---

## 20. Implementation Plan

## Phase 0: Inventory and Contract Freeze

**Goal:** Document existing authorities before introducing dependencies.

### Tasks

- Inventory current DivWand node types, roles, layouts, and validators.
- Inventory WAND formula and visual-role contracts.
- Inventory SCDL graph and asset attachment contracts.
- Inventory existing CSS tokens and generated school styles.
- Classify components as:
  - native leaf
  - eligible widget
  - workflow participant
  - layout-composed component
  - visual-attachment host
- Freeze v1 names for the four canonical contracts.
- Add architecture feature flags, default OFF.

### Exit criteria

- [ ] Inventory document approved.
- [ ] No duplicated canonical role registries remain undocumented.
- [ ] Contract names and versioning laws approved.
- [ ] Migration eligibility matrix completed.

---

## Phase 1: Canonical Contract Proof

**Goal:** Compile and render one component without Taffy, Cassowary, XState, or Skia.

### Pilot component

`ScrollEditorToolbar` (Phase 1 exit gate)

**Early proof (landed):** `compose` Button vocabulary + migrated Button under `src/core/compose/migrated/` — proves schema/flag/migration seams before toolbar.

### Tasks

- Define `SCHOL-COMPONENT-DEFINITION-v1`.
- Define toolbar component definition.
- Define toolbar instance schema.
- Define `PB-UI-SCENE-v1`.
- Define `PB-LAYOUT-v1`.
- Define `PB-UI-EVENT-v1`.
- Lower flow layout to native CSS.
- Render through DivWand/DOM adapter.
- Attach one WAND ornament through a visual slot.
- Validate keyboard and accessibility behavior.
- Emit PB-ERR diagnostics for malformed instances.

### Exit criteria

- [ ] Toolbar scene compiles deterministically.
- [ ] Packet golden test passes.
- [ ] DOM output preserves current behavior.
- [ ] Accessibility scan has zero critical or serious violations.
- [ ] WAND ornament can be removed without affecting toolbar semantics.
- [ ] No external state or layout library objects appear in the packet.

---

## Phase 2: Widget Adapter Proof

**Goal:** Prove local behavior contracts.

### Tasks

- Implement native and Zag behavior adapters.
- Migrate toolbar roving focus.
- Migrate tabs or dropdown as the second widget.
- Replay event traces in tests.
- Verify focus restoration and keyboard loops.
- Define custom-machine fallback policy.
- Keep existing widget implementation behind fallback flag.

### Exit criteria

- [ ] Same event sequence yields the same normalized widget state.
- [ ] Native and Zag adapters satisfy the same event contract where applicable.
- [ ] No widget directly mutates workflow actors.
- [ ] Existing visual behavior remains within approved tolerance.

---

## Phase 3: Layout Adapter Proof

**Goal:** Separate layout intent from target computation.

### Tasks

- Implement CSS lowering adapter.
- Implement Taffy non-DOM adapter.
- Add Taffy web shadow reporter.
- Compare toolbar and ledger layouts.
- Record intrinsic text and wrapping differences.
- Benchmark 50, 200, and 500 nodes.
- Do not apply Taffy rectangles to ordinary DOM flow.

### Exit criteria

- [ ] CSS adapter is authoritative on web.
- [ ] Taffy adapter produces bounded non-DOM geometry.
- [ ] Shadow drift report is deterministic.
- [ ] Unsupported parity differences are documented.
- [ ] No measurement/reflow feedback loop exists.

---

## Phase 4: Token Migration

**Goal:** Move existing tokens to one source of truth.

### Tasks

- Define DTCG-compatible source files.
- Generate existing CSS variable names.
- Generate JS and renderer token outputs.
- Compare generated values to current values.
- Keep current CSS as fallback during migration.
- Extend token verification scripts.

### Exit criteria

- [ ] Existing variables remain compatible.
- [ ] Token diff reports zero unexpected changes.
- [ ] WAND, DivWand, and DOM consume shared semantic token aliases.
- [ ] Generated files are reproducible.

---

## Phase 5: Workflow Proof

**Goal:** Migrate one genuine cross-component workflow.

### Pilot workflow

Choose one:

- combat turn orchestration
- multistep editor composition
- export and recovery workflow

### Tasks

- Define workflow event vocabulary.
- Implement XState adapter.
- Preserve React Router ownership.
- Route navigation requests through navigation adapter.
- Replay deterministic transition traces.
- Test cancellation, retry, and recovery.

### Exit criteria

- [ ] Workflow does not duplicate URL truth.
- [ ] Event replay yields the same state sequence.
- [ ] Old workflow remains available behind fallback flag.
- [ ] Cross-component commands are explicit.

---

## Phase 6: Constraint Spike

**Goal:** Decide whether Cassowary is justified.

### Entry requirement

Document three real layouts not cleanly representable with:

- CSS Grid
- Flexbox
- subgrid
- minmax
- container queries
- existing absolute/overlay layout

### Tasks

- Implement bounded constraint contract.
- Benchmark 50, 200, and 500 constraints.
- Test required conflicts.
- Test soft-constraint violation reporting.
- Test fallback layout.
- Verify worker feasibility if synchronous budgets fail.

### Exit criteria

- [ ] Adoption decision recorded.
- [ ] Constraint regions remain opt-in.
- [ ] Failure produces a lawful fallback.
- [ ] No ordinary flow component depends on Cassowary.

---

## Phase 7: Creative Renderer Proof

**Goal:** Render visual attachments outside DOM without migrating ordinary document UI.

### Tasks

- Implement renderer backend interface.
- Lazy-load Skia.
- Render WAND and SCDL visual attachments.
- Use Taffy only for non-DOM layout.
- Define text-measurement limitations.
- Compare geometry, not browser text pixels.
- Keep Vello experimental and unshipped.

### Exit criteria

- [ ] Skia loads only on opted-in surfaces.
- [ ] Renderer failure falls back or surfaces a diagnostic.
- [ ] Geometry parity stays within declared tolerance.
- [ ] Initial app bundle budget remains intact.

---

## Phase 8: Incremental Migration

Components migrate only when eligible.

Migration order:

1. Scroll editor toolbar
2. Tabs/dropdown widgets
3. Update Ledger window
4. ScholoCandy overlay
5. Tactical board
6. Combat command panel
7. Other eligible components

Trivial native leaves remain native.

---

## 21. Feature Flags

PDR logical names map onto living `src/core/compose/flags.ts` identifiers:

| PDR name | Living flag id | Default | Scope |
|---|---|---|---|
| `COMPOSED_UI_CONTRACTS_V1` | `compose:enabled` + `compose:schema` | OFF | Master / schema |
| `COMPOSED_UI_ZAG` | `compose:behavior` | OFF | Per widget |
| `COMPOSED_UI_TAFFY_SHADOW` | `compose:layout` (+ shadow reporter) | OFF | Diagnostic |
| `COMPOSED_UI_TAFFY_RENDER` | `compose:layout` (non-DOM path) | OFF | Non-DOM targets |
| `COMPOSED_UI_CASSOWARY` | `compose:layout` (constraint mode) | OFF | Per constraint region |
| `COMPOSED_UI_TOKENS` | `compose:tokens` | OFF | Global with fallback |
| `COMPOSED_UI_XSTATE` | `compose:workflow` | OFF | Per workflow |
| `COMPOSED_UI_SKIA` | `compose:render` | OFF | Per page or attachment host |
| `COMPOSED_UI_VELLO_EXPERIMENTAL` | (unshipped) | OFF | Development only |
| Per-component migration | `compose:migrate:<name>` | OFF | Per component |
| Shadow dual-run | `compose:shadow-mode` | OFF | Diagnostic |

Flags are build-time or configuration-backed. Public production behavior must not rely solely on mutable `localStorage` flags.

---

## 22. Rollback Strategy

1. Disable the smallest applicable feature flag.
2. Restore the existing component or workflow path.
3. Preserve canonical packet fixtures for diagnosis.
4. Record adapter and diagnostic output.
5. Retest the old path before release.
6. Re-enable only after the failed contract test exists.

Generated token rollback restores the previous generated artifact, not hand-edited generated files.

---

## 23. QA Plan

### 23.1 Contract tests

- component definitions
- component instance schemas
- UI scene canonicalization
- layout normalization
- event validation
- visual attachment resolution
- renderer capability negotiation

### 23.2 Behavior tests

- keyboard navigation
- focus restoration
- state replay
- ignored-event diagnostics
- custom adapter parity

### 23.3 Layout tests

- CSS lowering snapshots
- Taffy deterministic results
- Taffy shadow drift
- intrinsic sizing fixtures
- constraint conflict diagnostics
- fallback layouts

### 23.4 Accessibility tests

- axe-core scans
- keyboard-only navigation
- screen-reader manual audit
- focus visibility
- reduced-motion behavior
- semantic DOM snapshots

### 23.5 Rendering tests

- WAND attachment rendering
- SCDL attachment rendering
- Skia fallback
- geometry parity
- lazy-load isolation
- renderer disposal

### 23.6 Regression commands

```bash
npm run typecheck
npm run lint
npm run test:qa
npm run test:visual
npm run test:e2e
npm run verify:css-tokens
npm run dead:scan:ci
```

New commands:

```bash
npm run ui:schema:validate
npm run ui:contracts:test
npm run ui:layout:test
npm run ui:events:test
npm run ui:a11y:test
npm run ui:render:test
npm run ui:benchmark
```

---

## 24. Acceptance Criteria

### Architecture

- [ ] Canonical contracts are versioned and schema-validated.
- [ ] DivWand is the UI scene/composition authority.
- [ ] WAND is a visual attachment system.
- [ ] SCDL geometry remains independently valid.
- [ ] DOM + CSS remains the web semantic and flow-layout authority.
- [ ] Taffy is not applied as a second ordinary DOM layout engine.
- [ ] Cassowary is optional and bounded.
- [ ] React Router remains navigation authority.
- [ ] Runtime library objects are absent from canonical packets.

### Determinism

- [ ] Canonical packets serialize identically for identical input.
- [ ] Event replay produces identical normalized state.
- [ ] Layout normalization is deterministic.
- [ ] Token generation is reproducible.
- [ ] Diagnostics include replayable context.

### Accessibility

- [ ] Migrated components satisfy their declared accessibility contract.
- [ ] Native elements are used where sufficient.
- [ ] Keyboard navigation remains intact.
- [x] No critical or serious axe violations are introduced (Phase 11 compose toolbar suite).
- [ ] Reduced-motion preferences are honored.

### Performance

- [ ] Initial bundle increase remains within budget.
- [ ] Optional renderers are isolated.
- [ ] Layout and validation benchmarks meet targets or have approved exceptions.
- [ ] No DOM measure/reflow feedback loop is introduced.

### Migration safety

- [ ] Every migrated component retains a fallback during rollout.
- [ ] Feature flags are independently testable.
- [ ] Visual and behavior baselines are captured before migration.
- [ ] Rollback does not require schema deletion or packet mutation.

---

## 25. Risks

| Risk | Reduction |
|---|---|
| Too many layer seams | Keep four canonical contracts and narrow adapters. |
| Schema duplication | Make JSON Schema sovereign for instance validation. |
| WAND/DivWand overlap | Assign UI composition to DivWand and procedural visuals to WAND. |
| Dual web layout authorities | CSS owns web flow. Taffy remains non-DOM or shadow-only. |
| Router and workflow divergence | React Router owns location; workflows request navigation through an adapter. |
| State-machine overuse | Apply eligibility rules and prefer native controls. |
| Cassowary complexity | Require demonstrated use cases and a separate adoption gate. |
| Bundle growth | Lazy-load per adapter and track separate budgets. |
| DOM/Skia parity ambiguity | Compare semantic geometry and declared tolerances, not all pixels. |
| Migration fatigue | Pilot one component per layer before broad rollout. |
| Generated token regressions | Preserve public names and enforce token diffs. |
| Renderer capability mismatch | Explicit capability negotiation and lawful fallback. |

---

## 26. Resolved Decisions (formerly Open)

### D-1: UI authoring syntax — RESOLVED

**Primary:** Canonical JSON Schema + TypeScript component definitions (`src/core/compose/schema`, `vocabulary`).  
**Secondary (future):** SCDL-UI sibling dialect may lower into the same contracts; not required for Phase 1–5.  
**Law:** Both surfaces, if present, emit identical `SCHOL-COMPONENT-DEFINITION-v1` / `PB-UI-SCENE-v1` packets.

### D-2: Cassowary adoption — GATED (not rejected)

Cassowary remains **opt-in** behind constraint layout mode. Adoption as a general dependency still requires Phase 6 entry evidence (three layouts not cleanly expressible in CSS Grid/Flex/subgrid/minmax/container queries). Until then: constraint API may exist for spikes; no ordinary flow component may depend on it.

### D-3: Skia scope — RESOLVED

Default Skia/CanvasKit scope:

- WAND canvas
- PixelBrain visuals
- export surfaces
- selected creative UI regions

Ordinary forms and text-heavy UI remain DOM. Skia is lazy-loaded; excluded from initial app bundle budget.

### D-4: Component registry governance — RESOLVED

| Change type | Required review |
|---|---|
| Native leaf vocabulary (button, text, divider) | accessibility smoke only |
| Composite widget (tabs, dialog, menu, toolbar) | architecture **and** accessibility review |
| Contract field / version bump | architecture review + fixture update for every registered adapter |

### D-5: Schema generation tooling — RESOLVED

**Source of truth:** hand-authored JSON Schema documents + TypeScript types that are checked against them in CI (`compose` schema tests).  
**Generation:** TypeScript types and docs may be generated *from* schema; reverse (types-only without schema) is forbidden.  
**Near-term:** draft-07 schemas in `json-schemas.ts` are accepted; migrate validators to JSON Schema 2020-12 before declaring §9 fully closed.  
**Forbidden:** a second parallel hand-maintained type source that diverges from the schema.

---

## 26.1 Implementation status snapshot (2026-07-19)

Aligned with `src/core/compose/README.md` (living code wins if this table drifts — update both):

| Layer | Status | Notes |
|---|---|---|
| Schema + vocabulary | Shipped (flagged OFF) | Button pilot; registry + JSON Schema tests |
| Layout (Taffy-like + constraint spike) | Shipped (flagged OFF) | CSS lowering preferred on web; Cassowary still gated by D-2 |
| Behavior (Zag-inspired) | Shipped (flagged OFF) | Not yet full Zag.js dependency |
| Workflow (XState-inspired) | Shipped (flagged OFF) | Nav/form pilots; Router still authoritative |
| Tokens (DTCG) | Shipped (flagged OFF) | Must stay compatible with `verify:css-tokens` |
| Scene / WAND attachments | Shipped (flagged) | `visualRefs` + wand ornament slot; SceneBuilder remains geometry IR |
| Renderer DOM | Shipped (flagged) | `renderSceneToDomSpec` + hybrid hosts; Skia WASM skipped; Vello experimental stub |
| PB-UI-SCENE / PB-LAYOUT / PB-UI-EVENT full packets | Shipped | Emitters + goldens under `tests/qa/features/fixtures/` |
| ScrollEditorToolbar pilot (Phase 1 PDR) | Shipped (flagged OFF) | Scene + Compose shell; live TopBar swap shipped Phase 9 |
| Production page integration | Shipped (flagged OFF) | `IDEChrome` TopBar action-cluster swap via `compose:migrate:toolbar` |

---

## 27. Definition of Done

- [ ] `SCHOL-COMPONENT-DEFINITION-v1` implemented.
- [ ] `PB-UI-SCENE-v1` implemented.
- [ ] `PB-LAYOUT-v1` implemented.
- [ ] `PB-UI-EVENT-v1` implemented.
- [ ] Toolbar pilot migrated and verified.
- [ ] DivWand consumes canonical UI scene packets.
- [ ] WAND and SCDL assets attach through visual slots.
- [ ] CSS adapter owns web flow layout.
- [ ] Taffy non-DOM adapter passes deterministic fixtures.
- [ ] Taffy shadow mode reports drift without applying geometry.
- [ ] Zag adapter passes widget behavior fixtures.
- [ ] One XState workflow passes deterministic replay.
- [ ] React Router remains authoritative.
- [ ] DTCG token source generates compatible outputs.
- [ ] Cassowary has an explicit adoption or rejection decision.
- [x] Skia is isolated behind a lazy renderer adapter (Phase 10: stub, WASM skipped).
- [x] Vello remains experimental.
- [ ] PB-ERR diagnostics cover every new boundary.
- [ ] Accessibility and visual baselines pass.
- [ ] Bundle and benchmark budgets are documented.
- [ ] PIR records actual migration cost and architectural value.

---

## 28. Final Architectural Verdict

**Approved for phased implementation.** Open decisions D-1–D-5 are resolved in §26. Contract stubs are complete in §8. Living code: `src/core/compose/`.

The architecture is not a mandate to route every `<div>` through a compiler, solver, statechart, and GPU renderer.

It is a way to ensure that meaningful components possess durable identities and portable contracts.

The central system is:

```text
JSON/TS definitions (primary)  [SCDL-UI optional later]
        ↓
semantic component compiler  (src/core/compose)
        ↓
PB-UI-SCENE-v1
├── anatomy
├── accessibility
├── layout intent
├── state/event protocol
└── visual attachments
        ↓
target adapters
├── DOM + CSS
├── Zag (or Zag-inspired machines)
├── XState (or XState-inspired workflows)
├── Taffy
├── Cassowary (opt-in, gated)
├── WAND
├── SCDL geometry
├── Skia (lazy, creative scope)
└── future Vello
```

When Semantic Calculus is in the path: **kind is illocution, law.decision is permission, capability is archaeology** (§8.7). Never collapse them.

This architecture evolves Scholomance from a collection of powerful UI systems into a deterministic semantic interface compiler.

Its success depends on preserving one rule above all others:

> Canonical contracts own meaning. Adapters own implementation.
