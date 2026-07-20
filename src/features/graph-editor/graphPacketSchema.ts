/**
 * ScholomanceGraphPacket-v1
 *
 * Canonical source of truth for visual graph authoring in Scholomance OS.
 *
 * Rete.js is the interactive canvas only. This packet is the ritual diagram
 * that survives UI state, layout changes, and editor restarts.
 *
 * All compilers consume this packet, not Rete objects.
 */

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
    | "pixelbrain.geometryKernel"
    | "pixelbrain.symmetryAmp"
    | "pixelbrain.colorResolve"
    | "scdl.vectorOps"
    | "diagnostics.gate"
    | "export.svg"
    | "export.png"
    | "export.remotion"
    | "combat.spellEffect"
    | "combat.tileQuery"
    | "combat.damagePreview"
    | "math.expression"  // Added to support the recent procedural vector AST work
    ;

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

export type ScholomanceSocketDefV1 = {
  type: ScholomanceSocketTypeV1;
  optional?: boolean;
};

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
  | "export.artifact"
  | "math.scalar"
  | "math.vector2"
  | "math.expression"
  ;

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
    | "GRAPH-012 UI_LAYOUT_OUT_OF_SYNC"
    | "GRAPH-013 UNKNOWN_NODE_KIND"
    | "GRAPH-014 MATH_AST_INVALID";

  severity: "info" | "warn" | "error" | "fatal";

  nodeId?: string;
  connectionId?: string;
  message: string;
  suggestedFix?: string;
};

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

  deterministic: boolean;
  pure: boolean;

  ui: {
    defaultWidth: number;
    defaultHeight: number;
    icon?: string;
    colorToken?: string;
  };
};
