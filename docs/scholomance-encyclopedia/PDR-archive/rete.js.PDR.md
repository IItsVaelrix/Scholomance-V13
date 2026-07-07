# PDR — Rete.js Integration for Scholomance OS Node Graph Authoring

**Status:** Draft
**Date:** 2026-07-03
**Author:** Vaelrix / Scholomance OS
**Target Area:** Scholomance OS visual graph editor, PixelBrain/SCDL/Wand/DivWand pipeline authoring
**Change Class:** Architectural + structural
**Core Principle:** Rete.js is the interactive node canvas. Scholomance packets remain canonical truth.

---

## 1. Summary

Integrate **Rete.js** as the visual node-editor layer for authoring deterministic Scholomance pipelines: PixelBrain assets, SCDL compilation flows, Wand formula chains, DivWand lattice operations, Remotion/VideoForge scene graphs, diagnostics gates, and export pipelines.

Rete.js is a TypeScript-first framework for processing-oriented node editors, with graph visualization and processing modules available through plugins. Its docs position it as tailorable, processing-oriented, and usable with frameworks including React, Vue, Angular, Svelte, and Lit.
This PDR does **not** make Rete.js the source of truth. Instead, Scholomance introduces a canonical packet:

```ts
ScholomanceGraphPacket-v1
```

Rete.js renders and edits that packet through adapters. The compiler consumes the packet, not the Rete editor instance. The graph becomes a ritual diagram, but the packet remains the spellbook. 🕯️

---

## 2. Problem Statement

Scholomance OS currently has multiple powerful deterministic systems:

* PixelBrain lattice assets
* SCDL vector and cell compilation
* Wand mathematical stroke/formula proposals
* DivWand lattice rendering
* TurboQuant semantic unification
* diagnostics/bytecode gates
* Remotion/VideoForge packet-driven rendering

The missing interface layer is a **visual authoring surface** where these systems can be composed as typed, inspectable, reusable graphs.

Current risk:

* Pipeline logic becomes scattered across panels, commands, bridge files, and one-off compiler calls.
* AI-generated proposals are harder to audit visually.
* Designers cannot see dependency flow from intent → formula → lattice → packet → diagnostics → export.
* Determinism can drift if UI state becomes mixed with compiler state.
* Future systems, such as card-combat spell logic or PixelCinema scene construction, need graph authoring without inventing a custom node editor from ash and caffeine.

Rete.js solves the interactive node-canvas problem, but Scholomance must wrap it with strict canonical packet rules.

---

## 3. Goals

### Primary Goals

1. Add a visual graph editor for Scholomance creative pipelines.
2. Preserve deterministic compilation.
3. Support typed node sockets for PixelBrain/SCDL/Wand/Remotion data.
4. Serialize graphs into a canonical, checksum-ready packet.
5. Allow Rete.js UI layout state without letting layout mutate compiler output.
6. Provide diagnostics for invalid graph connections and non-deterministic nodes.
7. Support shadow mode before turning on graph-driven compilation.

### Secondary Goals

1. Enable reusable graph modules.
2. Allow nested/subgraph authoring later through Rete scopes.
3. Prepare for AI-assisted graph generation.
4. Enable visual debugging of packets, bytecode, and diagnostics.
5. Support future node palettes for MMORPG combat, card effects, spell scripting, and asset pipelines.

---

## 4. Non-Goals

This integration will **not**:

* Replace PixelBrain, SCDL, Wand, or DivWand.
* Let Rete.js editor objects become canonical project state.
* Store executable JavaScript functions inside saved graph packets.
* Allow `Math.random()`, `Date.now()`, `performance.now()`, or clock-dependent compilation.
* Compile directly from arbitrary Rete node class instances.
* Make the graph editor responsible for rendering final assets.
* Replace existing packet compilers.
* Introduce substrate/reality rewriting magic as normal graph behavior.

---

## 5. External Library Facts

Rete.js uses a graph model with nodes and edges, but calls edges **connections**. Its `NodeEditor` stores nodes and connections in normalized lists with required identifiers.

Rete.js import/export is not provided as a universal default because arbitrary node objects may include class instances, methods, cyclic references, or other non-JSON structures. Its docs recommend implementing import/export according to the application’s specific needs.

Rete.js supports processing approaches including dataflow and control flow, and its introduction says these approaches can be combined in the same graph. The dataflow guide shows `DataflowEngine` usage, including `engine.fetch(...)`, output caching, and `engine.reset(...)` when inputs change.

Rete.js validation can be implemented through pipes that intercept events such as node creation and connection creation. Returning no context prevents message propagation for actions like `nodecreate`, `noderemove`, `connectioncreate`, and `connectionremove`.

Rete.js scopes support nested nodes/subgraphs through `rete-scopes-plugin`, but the docs categorize it as advanced and require explicit node sizing. Auto-arrange uses `rete-auto-arrange-plugin` with `elkjs` as a peer dependency, and varying node sizes require explicit width and height values.

---

## 6. Core Decision

### Decision

Use **Rete.js v2-style architecture** as an editor shell, but create a Scholomance-owned canonical graph packet and compiler.

### Rationale

Rete.js gives Scholomance a mature node interaction layer: nodes, sockets, controls, connections, render plugins, validation hooks, dataflow/control-flow processing, scopes, minimap, history, and auto-arrange. Scholomance still needs deterministic source-of-truth rules that Rete does not enforce by default.

### Reduced Risk

This avoids the most dangerous failure mode: a beautiful visual editor whose internal object state becomes an untestable swamp-oracle.

---

## 7. Source of Truth Rule

### Canonical

```ts
ScholomanceGraphPacket-v1
```

### Non-Canonical

```ts
NodeEditor instance
Rete node class instances
React component state
canvas position state
drag/selection state
preview cache
temporary engine output
```

### Rule

The graph packet is the edit.
Rete is the authoring viewport.
The compiler is the authority.
Preview is a projection.
Export is a compiled artifact.

---

## 8. Proposed Architecture

```txt
User interaction
  ↓
Rete.js Editor View
  ↓
ReteGraphAdapter
  ↓
ScholomanceGraphPacket-v1
  ↓
Graph validation
  ↓
Graph compiler
  ↓
Target compiler bridge
  ├─ SCDL AST / SCDL source
  ├─ PixelBrainAssetPacket
  ├─ WandFormulaPacket
  ├─ DivWandLatticePacket
  ├─ VideoProjectPacket-v1
  ├─ CombatSpellPacket-v1
  └─ DiagnosticsPacket
```

---

## 9. Packet Schema

```ts
export type ScholomanceGraphPacketV1 = {
  schemaVersion: "scholomance.graph.v1";

  graphId: string;
  title: string;
  description?: string;

  determinism: {
    seed: string;
    checksum?: string;
    canonicalJsonVersion: "canonical-json.v1";
    createdBy: "human" | "ai" | "hybrid";
    compilationMode: "shadow" | "warn" | "gate" | "emit";
  };

  nodes: ScholomanceGraphNodeV1[];
  connections: ScholomanceGraphConnectionV1[];

  uiLayout: {
    renderer: "rete";
    version: "rete-layout.v1";
    positions: Record<string, { x: number; y: number }>;
    sizes?: Record<string, { width: number; height: number }>;
    viewport?: {
      x: number;
      y: number;
      zoom: number;
    };
  };

  metadata: {
    tags: string[];
    domain:
      | "pixelbrain"
      | "scdl"
      | "wand"
      | "divwand"
      | "videoforge"
      | "combat"
      | "mixed";
    authoringSurface: "ScholomanceReteGraphEditor";
    updatedAt?: string; // display-only, excluded from checksum unless normalized
  };

  diagnostics: ScholomanceGraphDiagnosticV1[];
};
```

---

## 10. Node Schema

```ts
export type ScholomanceGraphNodeV1 = {
  id: string;

  kind:
    | "source.scdl"
    | "source.pixelbrain"
    | "source.imageSeed"
    | "wand.formula"
    | "wand.mathematicalStroke"
    | "divwand.lattice"
    | "turboquant.semanticNormalize"
    | "pixelbrain.compile"
    | "pixelbrain.symmetryAmp"
    | "pixelbrain.colorResolve"
    | "scdl.vectorOps"
    | "diagnostics.gate"
    | "export.svg"
    | "export.png"
    | "export.remotion"
    | "combat.spellEffect"
    | "combat.tileQuery"
    | "combat.damagePreview";

  label: string;

  inputs: Record<string, ScholomanceSocketDefV1>;
  outputs: Record<string, ScholomanceSocketDefV1>;

  params: Record<string, unknown>;

  compiler: {
    resolverId: string;
    version: string;
    pure: boolean;
    deterministic: boolean;
    allowAsync: boolean;
  };

  provenance?: {
    source: "manual" | "ai" | "import" | "template";
    sourceRef?: string;
    rationale?: string;
  };
};
```

---

## 11. Connection Schema

```ts
export type ScholomanceGraphConnectionV1 = {
  id: string;

  source: {
    nodeId: string;
    socket: string;
  };

  target: {
    nodeId: string;
    socket: string;
  };

  type: ScholomanceSocketTypeV1;

  metadata?: {
    label?: string;
    optional?: boolean;
  };
};
```

---

## 12. Socket Type Registry

```ts
export type ScholomanceSocketTypeV1 =
  | "intent.text"
  | "intent.visual"
  | "formula.curve"
  | "formula.stroke"
  | "scdl.source"
  | "scdl.ast"
  | "pixelbrain.packet"
  | "pixelbrain.cells"
  | "pixelbrain.palette"
  | "lattice.qbit"
  | "diagnostics.packet"
  | "video.project"
  | "combat.spell"
  | "combat.tileState"
  | "export.artifact";
```

### Socket Rule

Connections are legal only when the source socket type can be resolved into the target socket type through an explicit adapter.

No implicit “any to any” sockets.

The void is hungry enough without type erasure. 🜏

---

## 13. Rete.js Integration Boundary

### New Module

```txt
src/features/graph-editor/
  ScholomanceGraphEditor.tsx
  createReteEditor.ts
  reteGraphAdapter.ts
  reteNodeFactory.ts
  reteSocketRegistry.ts
  reteValidationPipes.ts
  reteLayoutAdapter.ts
  graphPacketSchema.ts
  graphPacketCompiler.ts
  graphDiagnostics.ts
  nodeRegistry.ts
  nodes/
    SourceSCDLNode.ts
    WandFormulaNode.ts
    MathematicalStrokeNode.ts
    DivWandLatticeNode.ts
    PixelBrainCompileNode.ts
    DiagnosticsGateNode.ts
    ExportSvgNode.ts
```

---

## 14. Adapter Rule

Rete nodes must be treated as **projection objects**.

```ts
Rete NodeEditor
  → adapter.exportPacket()
  → ScholomanceGraphPacket-v1
  → compiler.compile(packet)
```

And the reverse:

```ts
ScholomanceGraphPacket-v1
  → adapter.importPacket(packet)
  → Rete NodeEditor
```

Because Rete’s own docs note that import/export depends on application-specific serialization needs, Scholomance must own this adapter instead of relying on raw Rete node object serialization.

---

## 15. Compilation Model

### V0 Compiler Mode

```ts
type GraphCompilationMode = "shadow" | "warn" | "gate" | "emit";
```

| Mode     | Behavior                                                            |
| -------- | ------------------------------------------------------------------- |
| `shadow` | Build graph packet and diagnostics, but do not affect live outputs. |
| `warn`   | Preview graph output while showing diagnostics.                     |
| `gate`   | Prevent export if diagnostics fail.                                 |
| `emit`   | Graph packet can produce canonical target artifacts.                |

### V0 Recommendation

Start in `shadow`.

Reason: graph editing touches many shared systems. Shadow mode lets Scholomance observe packet drift before the node editor becomes a production compiler path.

---

## 16. Processing Rule

Rete’s `DataflowEngine` may be used for preview-only evaluation, but canonical compilation must use `graphPacketCompiler.ts`.

### Allowed

```txt
Rete DataflowEngine → fast UI preview
Scholomance compiler → canonical artifact
```

### Not Allowed

```txt
Rete DataflowEngine → final PixelBrainAssetPacket
Rete DataflowEngine → final SCDL packet
Rete class instance → saved canonical graph
```

The Rete dataflow docs describe engine output caching and `engine.reset(...)` for recomputation, which is useful for previews but must not become a hidden source of deterministic compiler state.

---

## 17. Validation Rules

Validation occurs in three layers.

### Layer 1: Rete Interaction Validation

Use Rete pipes to prevent obvious invalid connections.

Examples:

```ts
connectioncreate:
  formula.stroke → pixelbrain.palette ❌
  scdl.ast → scdl.vectorOps ✅
  pixelbrain.packet → export.svg ✅
```

Rete supports validation through pipes for events such as `nodecreate` and `connectioncreate`, including preventing propagation when validation fails.

### Layer 2: Packet Validation

Validate the exported `ScholomanceGraphPacket-v1`.

Checks:

* Unique node IDs
* Unique connection IDs
* No orphaned connections
* No missing resolver IDs
* No unsupported socket type
* No cycles unless node kind explicitly allows cycles
* No non-deterministic compiler flag
* All required params present
* All target compiler dependencies available

### Layer 3: Compiler Validation

Each target compiler performs domain-specific checks.

Examples:

* SCDL vector op validity
* PixelBrain cell bounds
* palette resolution
* symmetry constraints
* diagnostic severity gates
* export target compatibility

---

## 18. Diagnostics

```ts
export type ScholomanceGraphDiagnosticV1 = {
  code:
    | "GRAPH-001 DUPLICATE_NODE_ID"
    | "GRAPH-002 DUPLICATE_CONNECTION_ID"
    | "GRAPH-003 MISSING_NODE"
    | "GRAPH-004 INVALID_SOCKET_TYPE"
    | "GRAPH-005 INVALID_CONNECTION"
    | "GRAPH-006 CYCLE_NOT_ALLOWED"
    | "GRAPH-007 NON_DETERMINISTIC_NODE"
    | "GRAPH-008 MISSING_RESOLVER"
    | "GRAPH-009 PARAM_SCHEMA_INVALID"
    | "GRAPH-010 TARGET_COMPILER_UNAVAILABLE"
    | "GRAPH-011 PREVIEW_CANONICAL_MISMATCH"
    | "GRAPH-012 UI_LAYOUT_OUT_OF_SYNC";

  severity: "info" | "warn" | "error" | "fatal";

  nodeId?: string;
  connectionId?: string;
  message: string;
  suggestedFix?: string;
};
```

---

## 19. Node Registry

Every graph node must be declared in a central registry.

```ts
export type ScholomanceGraphNodeDefinition = {
  kind: ScholomanceGraphNodeV1["kind"];
  label: string;
  category:
    | "Source"
    | "Wand"
    | "DivWand"
    | "PixelBrain"
    | "SCDL"
    | "Diagnostics"
    | "Export"
    | "Combat"
    | "VideoForge";

  inputs: Record<string, ScholomanceSocketDefV1>;
  outputs: Record<string, ScholomanceSocketDefV1>;

  paramsSchema: unknown;

  resolverId: string;

  deterministic: true;
  pure: true;

  ui: {
    defaultWidth: number;
    defaultHeight: number;
    icon?: string;
    colorToken?: string;
  };
};
```

### Registry Rule

No node may be created if it is not registered.

This keeps AI proposals, user-created graphs, and imported graph templates from smuggling mystery meat into the compiler.

---

## 20. First Node Set

### V0 Nodes

| Node                           | Purpose                                                          |
| ------------------------------ | ---------------------------------------------------------------- |
| `source.scdl`                  | Provides SCDL source text.                                       |
| `scdl.vectorOps`               | Parses/expands vector operations into lower compiler intent.     |
| `wand.formula`                 | Emits deterministic formula bytecode.                            |
| `wand.mathematicalStroke`      | Emits stroke formula packet.                                     |
| `divwand.lattice`              | Converts formula/stroke/intent into lattice proposal.            |
| `turboquant.semanticNormalize` | Normalizes semantic intent into typed compiler inputs.           |
| `pixelbrain.colorResolve`      | Resolves named color intent into canonical palette/byte mapping. |
| `pixelbrain.symmetryAmp`       | Applies deterministic symmetry expansion.                        |
| `pixelbrain.compile`           | Emits `PixelBrainAssetPacket`.                                   |
| `diagnostics.gate`             | Stops invalid packet flow.                                       |
| `export.svg`                   | Emits SVG artifact preview/export.                               |

### V1 Nodes

| Node                   | Purpose                                                    |
| ---------------------- | ---------------------------------------------------------- |
| `source.imageSeed`     | Accepts aspiration seed metadata, not raw canonical truth. |
| `export.remotion`      | Emits VideoProjectPacket-compatible graph layer.           |
| `combat.spellEffect`   | Builds deterministic combat spell effect packet.           |
| `combat.tileQuery`     | Reads tactical tile state.                                 |
| `combat.damagePreview` | Produces preview-only combat calculations.                 |

---

## 21. UI Layout

Rete positions, viewport, selection, panel state, minimap state, and node sizing are stored under:

```ts
packet.uiLayout
```

### Determinism Rule

`uiLayout` is persisted for user experience, but compiler output must remain identical if only `uiLayout` changes.

### Test

```txt
packetA = same nodes/connections/params, different uiLayout
packetB = same nodes/connections/params, different uiLayout

compile(packetA).checksum === compile(packetB).checksum
```

---

## 22. Auto-Arrange

Use auto-arrange only as a UI convenience. Rete’s auto-arrange plugin requires `elkjs`, and explicit node sizing is important for layout, especially when node sizes vary.

### Rule

Auto-arrange may modify:

```ts
uiLayout.positions
uiLayout.sizes
uiLayout.viewport
```

Auto-arrange must not modify:

```ts
nodes
connections
params
compiler
determinism
```

---

## 23. Nested Graphs / Subgraphs

Do not ship nested graphs in V0.

Rete scopes support nested nodes/subgraphs, but the docs categorize this as advanced and require explicit node sizing.

### V1 Plan

Introduce:

```ts
kind: "module.graph"
```

With:

```ts
params: {
  graphRef: string;
  exposedInputs: string[];
  exposedOutputs: string[];
}
```

### Constraint

Subgraphs compile as separate packets first, then become immutable module nodes in parent graphs.

---

## 24. AI-Assisted Graph Generation

AI may propose graph packets, but not Rete node instances.

### Allowed

```txt
AI → ScholomanceGraphPacket-v1 draft → validation → Rete render
```

### Not Allowed

```txt
AI → direct Rete object mutation → compiler output
```

### Required AI Fields

```ts
provenance: {
  source: "ai";
  rationale: string;
}
```

AI-created graph packets start in `shadow` mode.

---

## 25. File Plan

```txt
src/features/graph-editor/
  graphPacketSchema.ts
    - TypeScript types
    - Zod schema or equivalent explicit validator

  nodeRegistry.ts
    - central node definitions
    - socket declarations
    - resolver IDs
    - UI defaults

  reteSocketRegistry.ts
    - maps Scholomance socket types to Rete sockets
    - checks compatibility

  reteNodeFactory.ts
    - creates Rete node classes from node registry
    - no compiler logic

  createReteEditor.ts
    - initializes NodeEditor
    - attaches area/render/connection/history/minimap plugins
    - attaches validation pipes

  reteGraphAdapter.ts
    - packet → Rete editor
    - Rete editor → packet

  graphPacketCompiler.ts
    - canonical graph compiler
    - topological execution
    - calls existing target compilers

  graphDiagnostics.ts
    - validation diagnostics
    - compiler diagnostics normalization

  ScholomanceGraphEditor.tsx
    - React shell
    - palette
    - inspector
    - packet preview
    - diagnostics panel
```

---

## 26. Suggested Dependency Set

```bash
npm i rete rete-area-plugin rete-connection-plugin rete-react-plugin rete-engine
```

Optional after V0:

```bash
npm i rete-history-plugin rete-minimap-plugin rete-context-menu-plugin
npm i rete-auto-arrange-plugin elkjs
npm i rete-scopes-plugin
```

Use `rete-react-plugin` if Scholomance’s current client shell remains React/Vite. Rete also supports Vue, Angular, Svelte, and Lit renderers, but React is the lowest-disruption assumption for the existing web client.

---

## 27. Compiler Skeleton

```ts
export function compileScholomanceGraphPacket(
  packet: ScholomanceGraphPacketV1,
  context: GraphCompileContext
): GraphCompileResult {
  const diagnostics = validateGraphPacket(packet, context);

  if (hasFatal(diagnostics)) {
    return {
      ok: false,
      diagnostics,
      artifacts: []
    };
  }

  const executionPlan = buildDeterministicExecutionPlan(packet);

  const state = createGraphCompileState({
    seed: packet.determinism.seed,
    nodeOutputs: new Map()
  });

  for (const step of executionPlan.steps) {
    const node = packet.nodes.find(n => n.id === step.nodeId);

    if (!node) {
      state.addDiagnostic({
        code: "GRAPH-003 MISSING_NODE",
        severity: "fatal",
        nodeId: step.nodeId,
        message: `Execution plan referenced missing node ${step.nodeId}`
      });
      break;
    }

    const resolver = context.resolvers.get(node.compiler.resolverId);

    if (!resolver) {
      state.addDiagnostic({
        code: "GRAPH-008 MISSING_RESOLVER",
        severity: "fatal",
        nodeId: node.id,
        message: `Missing resolver ${node.compiler.resolverId}`
      });
      break;
    }

    const inputValues = collectNodeInputs(packet, state, node);

    const result = resolver.resolve({
      node,
      inputs: inputValues,
      seed: packet.determinism.seed,
      context
    });

    state.nodeOutputs.set(node.id, result.outputs);
    state.addDiagnostics(result.diagnostics);
  }

  return finalizeGraphCompileResult(packet, state);
}
```

---

## 28. Rete Adapter Skeleton

```ts
export async function exportReteToGraphPacket(
  editor: NodeEditor<ScholomanceReteSchemes>,
  layout: ReteLayoutSnapshot,
  options: ExportGraphPacketOptions
): Promise<ScholomanceGraphPacketV1> {
  const nodes = editor.getNodes().map(reteNodeToPacketNode);
  const connections = editor.getConnections().map(reteConnectionToPacketConnection);

  const packet: ScholomanceGraphPacketV1 = {
    schemaVersion: "scholomance.graph.v1",
    graphId: options.graphId,
    title: options.title,

    determinism: {
      seed: options.seed,
      canonicalJsonVersion: "canonical-json.v1",
      createdBy: options.createdBy,
      compilationMode: options.compilationMode
    },

    nodes,
    connections,

    uiLayout: {
      renderer: "rete",
      version: "rete-layout.v1",
      positions: layout.positions,
      sizes: layout.sizes,
      viewport: layout.viewport
    },

    metadata: {
      tags: options.tags ?? [],
      domain: options.domain,
      authoringSurface: "ScholomanceReteGraphEditor"
    },

    diagnostics: []
  };

  return attachGraphDiagnostics(packet);
}
```

---

## 29. Rete Validation Pipe Skeleton

```ts
editor.addPipe(context => {
  if (context.type === "connectioncreate") {
    const connection = context.data;

    const verdict = validateReteConnection({
      editor,
      connection,
      socketRegistry
    });

    if (!verdict.ok) {
      publishGraphDiagnostic({
        code: "GRAPH-005 INVALID_CONNECTION",
        severity: "error",
        connectionId: connection.id,
        message: verdict.message,
        suggestedFix: verdict.suggestedFix
      });

      return;
    }
  }

  return context;
});
```

---

## 30. Rollout Plan

### Phase 0: Shadow Editor

* Add Rete editor route/panel.
* Add node registry.
* Add packet schema.
* Add adapter export.
* Add diagnostics.
* No production compiler emission.

Success criteria:

```txt
Can create graph visually.
Can export ScholomanceGraphPacket-v1.
Can reload packet into Rete.
No compiler output depends on Rete instance state.
```

---

### Phase 1: PixelBrain/SCDL Pipeline

* Add SCDL source node.
* Add vector ops node.
* Add PixelBrain compile node.
* Add diagnostics gate node.
* Add SVG export preview node.

Success criteria:

```txt
SCDL graph compiles to same packet as direct compiler path.
Different node positions do not change artifact checksum.
Invalid socket connections are blocked.
Diagnostics show exact node/connection ownership.
```

---

### Phase 2: Wand / DivWand

* Add Wand formula node.
* Add mathematical stroke node.
* Add DivWand lattice node.
* Add TurboQuant semantic normalize node.

Success criteria:

```txt
Formula genome → trait expression → lattice → PixelBrain packet works visually.
All graph outputs match direct pipeline outputs.
Preview can run through Rete dataflow, but final output comes from graphPacketCompiler.
```

---

### Phase 3: VideoForge / Combat

* Add Remotion export node.
* Add combat spell effect node.
* Add tactical tile query node.
* Add damage preview node.

Success criteria:

```txt
Graph can author a reusable visual spell effect.
Graph can emit VideoProjectPacket-compatible clip data.
Combat preview remains separated from canonical combat state.
```

---

### Phase 4: Modules and Scopes

* Add graph modules.
* Consider Rete scopes for nested visual groups.
* Add module import/export registry.

Success criteria:

```txt
Subgraphs compile independently.
Parent graphs consume module outputs without mutating child packet internals.
```

---

## 31. Regression Risks

| Risk                            | What Could Break                           | Mitigation                                                                        |
| ------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------- |
| UI state leaks into compiler    | Layout movement changes output             | Exclude `uiLayout` from compile checksum.                                         |
| Rete object serialization drift | Saved graphs fail after class changes      | Serialize Scholomance packets only.                                               |
| Invalid socket coercion         | Wrong compiler receives wrong data         | Central socket registry and validation pipes.                                     |
| Preview/compiler mismatch       | Rete preview says yes, compiler says no    | Add `GRAPH-011 PREVIEW_CANONICAL_MISMATCH`.                                       |
| Async node nondeterminism       | Different runs produce different output    | Async allowed only for preview unless resolver is deterministic and cache-stable. |
| Graph cycles                    | Infinite execution                         | Cycles banned in V0 except explicit future loop node kinds.                       |
| Plugin bloat                    | Editor slows down                          | Start with minimal plugins. Add minimap/history/arrange after baseline.           |
| AI graph hallucination          | Invalid resolver IDs or fantasy node kinds | Registry gate. Unknown nodes rejected.                                            |

---

## 32. QA Checklist

### Packet QA

* [ ] Exported graph packet passes schema validation.
* [ ] Duplicate node IDs produce `GRAPH-001`.
* [ ] Duplicate connection IDs produce `GRAPH-002`.
* [ ] Missing node reference produces `GRAPH-003`.
* [ ] Invalid socket type produces `GRAPH-004`.
* [ ] Invalid connection produces `GRAPH-005`.
* [ ] Non-deterministic node flag produces `GRAPH-007`.
* [ ] Missing resolver produces `GRAPH-008`.

### Determinism QA

* [ ] Same packet compiles to same checksum.
* [ ] Moving nodes does not change compiler checksum.
* [ ] Changing viewport does not change compiler checksum.
* [ ] Auto-arrange does not change compiler checksum.
* [ ] Rete preview cache reset does not change canonical output.

### Rete UI QA

* [ ] Nodes can be created from registry only.
* [ ] Connections are blocked when socket types mismatch.
* [ ] Graph can be saved and reloaded.
* [ ] Inspector edits update packet params.
* [ ] Diagnostics panel highlights related node or connection.
* [ ] Undo/redo does not produce invalid packet state.

### Compiler QA

* [ ] Direct SCDL compile and graph SCDL compile match.
* [ ] Direct PixelBrain compile and graph PixelBrain compile match.
* [ ] Diagnostics gate blocks export in `gate` mode.
* [ ] `shadow` mode never mutates live project artifacts.
* [ ] `emit` mode requires zero fatal diagnostics.

### Regression Retest Steps

1. Create a simple graph: `source.scdl → scdl.vectorOps → pixelbrain.compile → export.svg`.
2. Save packet.
3. Reload packet.
4. Compile packet twice.
5. Move every node and compile again.
6. Confirm artifact checksum is unchanged.
7. Create invalid connection.
8. Confirm connection is blocked and diagnostic is emitted.
9. Change a real param, such as palette or vector radius.
10. Confirm checksum changes only when semantic graph data changes.

---

## 33. Acceptance Criteria

This PDR is accepted when:

```txt
Scholomance can visually author a graph.
The graph serializes to ScholomanceGraphPacket-v1.
The packet can reload into Rete.
The packet can compile through a deterministic compiler path.
The compiler does not depend on Rete runtime object identity.
PixelBrain/SCDL outputs match direct compiler outputs.
Invalid graph states produce bytecode-style diagnostics.
```

---

## 34. Final Decision

Adopt Rete.js as the **visual node authoring layer** for Scholomance OS.

Do not adopt Rete.js as canonical graph storage.

The correct architecture is:

```txt
Rete.js = hands
ScholomanceGraphPacket-v1 = nervous system
Graph compiler = brainstem
PixelBrain/SCDL/Wand/DivWand = organs
Diagnostics = immune system
```

This turns the editor into a living ritual board without letting the UI become a swamp cathedral.
