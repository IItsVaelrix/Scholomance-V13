# SCHEMA_CONTRACT.md

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-LAW-SCHEMA-CONTRACT`

> Read first: `SHARED_PREAMBLE.md` -> `VAELRIX_LAW.md` -> this file.

## Living Document - Owned by Codex, Read by All Agents

**Version: 1.31** | Last updated: 2026-07-02

> Bump the version on every schema change.
> Notify Claude for UI-consumed field changes.
> Notify Gemini for fixture, regression-test, and backend implementation changes.

---

## SCHEMA CHANGE NOTICE

- Schema: SCDL v1 vector authoring ops
- Version: 1.30 -> 1.31
- Changed fields: registered SCDL vector AST op variants `circle`, `ring`, `rect`, `polygon`, `path`, and `sphere`; documented the deterministic `expandVectorPass` lowering step before symmetry; reserved `SCDL-011 INVALID_VECTOR_OP` for invalid vector authoring parameters
- Breaking: no
- Claude impact: no required UI change; authoring or dev-harness surfaces may render SCDL-derived assets only after compiler lowering and must not treat vector source ops as runtime pixel truth
- Gemini impact: tests should assert signed/decimal vector parsing, deterministic vector-to-cell lowering, vector-before-symmetry ordering, `sphere` tier behavior, path curve flattening, and `SCDL-011` diagnostics

---

## SCDL Vector Authoring Contract

SCDL vector ops are authoring-time AST instructions. They are never persisted as final asset geometry. `expandVectorPass` lowers them into ordinary `cell` ops before `expandSymmetryPass`, `expandCellsPass`, packet emission, and exporter output.

```ts
type SCDLColorRef =
  | { kind: "hex"; value: string }
  | { kind: "alias"; value: string };

type SCDLVectorOp =
  | { op: "circle"; cx: number; cy: number; radius: number; colorRef?: SCDLColorRef; color?: string }
  | { op: "ring"; cx: number; cy: number; radius: number; width: number; colorRef?: SCDLColorRef; color?: string }
  | { op: "rect"; x: number; y: number; w: number; h: number; colorRef?: SCDLColorRef; color?: string }
  | { op: "polygon"; points: Array<[number, number]>; colorRef?: SCDLColorRef; color?: string }
  | { op: "path"; d: string; colorRef?: SCDLColorRef; color?: string }
  | {
      op: "sphere";
      cx: number;
      cy: number;
      radius: number;
      lx: number;          // signed finite light vector x; default -1
      ly: number;          // signed finite light vector y; default -1
      tierColorRefs?: SCDLColorRef[];
      tierColors?: string[]; // exactly 5 after resolveColors: shine, glow, core, rim, shadow
    };
```

Invariants:
- Numeric vector coordinates may be signed or decimal; emitted lattice cells remain integer coordinates.
- `sphere` uses fixed tier thresholds `[0.999, 0.70, 0.10, -0.40]`; the exact center cell maps explicitly to the final tier rather than relying on `NaN` comparison behavior.
- Invalid vector parameters emit `SCDL-011` through `PB-ERR-v1`; examples include non-positive radii, non-positive ring width, non-positive rect dimensions, fewer than three polygon points, empty paths, missing sphere tier colors, or a zero light vector.
- Path support includes `M/L/H/V/Q/T/C/S/Z`; `A` preserves endpoint continuity as a straight segment until full arc rasterization is required by an approved asset.

---

## SCHEMA CHANGE NOTICE

- Schema: PixelBrain pipeline golden corpus report contract
- Version: 1.29 -> 1.30
- Changed fields: added `PixelBrainPipelineCorpusCase` and `PixelBrainPipelineCorpusReport` as internal CLI/core diagnostic envelopes for mutation and finish-suite corpus execution; no persisted bytecode family is reserved
- Breaking: no
- Claude impact: no required UI change; any future `/pixelbrain` surface must treat corpus results as backend/core diagnostics only, not as client-authoritative asset truth
- Gemini impact: QA-owned tests can import the corpus runner and assert stable case IDs, expected audit failures, embedded `PB-ERR-v1` bytecodes for forge mutations, and deterministic finish-suite invariants

---

## SCHEMA CHANGE NOTICE

- Schema: Memory Cell Osmosis TurboQuant receptor contract
- Version: 1.28 -> 1.29
- Changed fields: added `MemoryCellPacket`, `MemoryCellVectorPacket`, `MemoryCellMembrane`, `MemoryCellOsmosisObservation`, and `MemoryCellOsmosisResult`; registered `SCHOL-MEMCELL-v1` and `SCHOL-MEMCELL-OSMOSIS-v1` as internal diagnostic-memory contracts for anomaly-only receptor evaluation
- Breaking: no
- Claude impact: no required UI change; future UI may render osmosis anomaly results only as backend/core-derived diagnostics, never as client-authoritative decisions
- Gemini impact: immunity tests should assert deterministic packet checksums, baseline drift detection, antigen match detection, silent non-anomalies, and `PB-ERR-v1` failures for malformed packets

---

## SCHEMA CHANGE NOTICE

- Schema: PixelBrain silhouette blueprint and three-view shadow gate contract
- Version: 1.27 -> 1.28
- Changed fields: registered `PB-SILH-BLUEPRINT-v1` as the serialized `.silh` silhouette blueprint artifact; ratified the legal `.silh` grammar directives; extended `PixelBrainCraftGateAudit.target` with `silhouetteBlueprint` and `silhouetteAnimation` audits for rest-pose shadow matching and animation lockstep verification
- Breaking: no
- Claude impact: `/pixelbrain` surfaces may load `.silh` text only through the adapter seam and render normalized per-view/per-phase verdicts after the backend contract lands; UI must not treat PNG previews or shaders as silhouette authority
- Gemini impact: parser, projection, scanner, forge-gate, and CLI tests must assert digest stability, legal directive validation, front/side/top integer shadow comparison, grid mismatch failures, and animation lockstep/rigid invariant failures using existing `PB-ERR-v1` categories

---

## SCHEMA CHANGE NOTICE

- Schema: PixelBrain item voxel artifact and craft gate audit contract
- Version: 1.26 -> 1.27
- Changed fields: registered `PB-VOXEL-ITEM-v1` as the serialized item voxel artifact emitted from `forgeItemAsset().voxelPacket`; documented the sibling in-memory `VoxelVolume` shape emitted as `forgeItemAsset().volume`; added the CLI-only `PixelBrainCraftGateReport` contract for future forge asset immunity gates without reserving a new persisted bytecode family
- Breaking: no
- Claude impact: Godot/UI consumers may read `PB-VOXEL-ITEM-v1` only as a serialized boundary artifact; `/pixelbrain` surfaces must not treat in-memory `VoxelVolume` buffers or PNG previews as canonical persistence
- Gemini impact: forge/foundry tests must assert voxel packet determinism, y->z->x voxel ordering, material table authority, energy range/type validity, and craft-gate failures for malformed voxel packets

---

## SCHEMA CHANGE NOTICE

- Schema: ScholoCandy Eq Preset V2
- Version: 1.24 -> 1.25
- Changed fields: Added explicit v2 `scholomance/eq-preset` schema for the ScholoCandy DSP plugin. Formalized base32/sha256/crc32 bytecode encoding in Rust and removed reliance on python generation scripts. Added new FilterTypes (`BandPass`, `AllPass`, `Tilt`).
- Breaking: yes (Codegen removed, DSP parameters refactored)
- Claude impact: Web interfaces building preset strings must generate valid base32 bytecodes matching the updated Rust signature.
- Gemini impact: Must rely on Rust code for preset manipulation, do not execute old codegen python scripts.

## SCHEMA CHANGE NOTICE

- Schema: BytecodeXP QBIT memory infusion contract
- Version: 1.23 -> 1.24
- Changed fields: added internal `BytecodeXPVaccineArtifact`, `QbitPulseNodeArtifact`, `QbitProbeEnrichmentArtifact`, and `BytecodeXPMemoryEnvelope` contracts for `PB-XP-v1` vaccine artifacts and QBIT pulse memory envelopes; reserved `SCHOL-BYTXP-MEM-v1` as the internal memory envelope schema
- Breaking: no
- Claude impact: no required UI change; future surfaces may render these artifacts only after an explicit product/UI integration
- Gemini impact: diagnostic and MCP fixture tests can assert the stable envelope contract without inferring fields from implementation modules

## SCHEMA CHANGE NOTICE

- Schema: Ritual prediction convergence contract
- Version: 1.22 -> 1.23
- Changed fields: added `RitualPrediction*` runtime and artifact contracts, including canonical context, candidate, diagnostic, artifact, and PixelBrain projection shapes used by the shared ritual prediction engine; reserved `PB-PRED-v1` as the export bytecode family for future persisted/shared artifacts
- Breaking: no
- Claude impact: editor and diagnostic consumers can rely on one shared ritual prediction artifact shape if they choose to surface backend or local prediction traces
- Gemini impact: predictor, PLS, and backend parity batteries can assert the shared ritual prediction result and artifact contract without inferring fields from individual callers

## SCHEMA CHANGE NOTICE

- Schema: TrueSight rhyme color registry word-analysis contract
- Version: 1.21 -> 1.22
- Changed fields: added `WordAnalysis`; documented `WordAnalysis.rhymeKey: string | null` as a required Truesight field and formalized optional bytecode passthrough on the normalized analysis object
- Breaking: no
- Claude impact: `ReadPage` / `ScrollEditor` may rely on `analysis.rhymeKey` being present as `string | null` when building verse-scoped rhyme color registries
- Gemini impact: panel-analysis fixtures and Truesight overlay assertions can treat missing `rhymeKey` as a contract violation instead of an optional field

## SCHEMA CHANGE NOTICE

- Schema: Collab assignment preflight contract
- Version: 1.19 -> 1.20
- Changed fields: added `TaskAssignmentPreflightConflict` and `TaskAssignmentPreflightResponse`; documented `GET /collab/tasks/:id/preflight`
- Breaking: no
- Claude impact: Collab assignment UI can rely on a real backend preflight response instead of fallback optimistic copy
- Gemini impact: collab route, service, and UI fixtures can assert clean assignment, ownership-override, and lock-conflict preflight states

## SCHEMA CHANGE NOTICE

- Schema: Global UI Stacking Tiers
- Version: 1.18 -> 1.19
- Changed fields: Added `Z_BASE`, `Z_ABOVE`, `Z_OVERLAY`, `Z_SYSTEM` semantic constants.
- Breaking: Yes (Prohibits hardcoded z-indexes per Law 10)
- Claude impact: All components using hardcoded z-indexes must migrate to these semantic tiers.
- Gemini impact: Visual regression tests should validate that components remain in their assigned tiers.

## SCHEMA CHANGE NOTICE

- Schema: VerseIR PixelBrain phase 1 bridge contract
- Version: 1.17 -> 1.18
- Changed fields: added `PixelBrainPalette`, `PixelBrainCoordinate`, and `PixelBrainPayload`; `VerseIRAmplifierPayload` may now optionally expose `pixelBrain`
- Breaking: no
- Claude impact: Read analysis surfaces may optionally consume `analysis.verseIRAmplifier.pixelBrain` for future pixel overlays, but no existing UI consumer is required to change
- Gemini impact: panel-analysis fixtures and VerseIR amplifier serialization snapshots can include the new optional `pixelBrain` payload

## SCHEMA CHANGE NOTICE

- Schema: VerseIR Narrative AMP contract
- Version: 1.16 -> 1.17
- Changed fields: added `NarrativeAMPBeat`, `NarrativeAMPRevision`, `NarrativeAMPResonance`, and `NarrativeAMPPayload`; `/api/analysis/panels` may now include `narrativeAMP`; `oracle` is retained as a compatibility alias during migration
- Breaking: no
- Claude impact: Read analysis surfaces should prefer `narrativeAMP` and may fall back to `oracle` while older consumers are still migrating
- Gemini impact: panel-analysis fixtures can include the new optional payload while continuing to accept the legacy oracle alias

## SCHEMA CHANGE NOTICE

- Schema: VerseIR TrueVision travelling-wave contract
- Version: 1.15 -> 1.16
- Changed fields: `VerseTokenIR` now optionally exposes `visualBytecode` and `trueVisionBytecode`; `VerseIRAmplifierResult` may carry plugin `payload`; `VerseIRAmplifierPayload` and `VerseIR` can now optionally expose `trueVision`
- Breaking: no
- Claude impact: Read/editor surfaces can keep using `visualBytecode` and may optionally consume `trueVisionBytecode` / `trueVision` for deeper Truesight overlays later
- Gemini impact: VerseIR fixtures, panel-analysis fixtures, and serialization snapshots can include the new optional bytecode and TrueVision payloads

## SCHEMA CHANGE NOTICE

- Schema: Scroll persistence contract
- Version: 1.14 -> 1.15
- Changed fields: `Scroll` now exposes optional `submittedAt`; scroll persistence can distinguish autosaved drafts from first-time submitted scrolls
- Breaking: no
- Claude impact: Read/editor surfaces can keep autosaving drafts while reserving one-time submission behaviors such as XP awards for explicit saves
- Gemini impact: scroll fixtures and persistence assertions can include `submittedAt` for draft-vs-submitted coverage

---

## SCHEMA CHANGE NOTICE

- Schema: VerseIR substrate hardening contract
- Version: 1.13 -> 1.14
- Changed fields: `VerseLineIR`, `VerseTokenIR`, and `SyllableWindowIR` now expose parallel grapheme offsets; `VerseIR` adds `surfaceSpans`; VerseIR metadata now records applied window limits, offset semantics, grapheme support, and normalization policy; `VerseTokenIR` may expose `phoneticDiagnostics`; compiler descriptors may optionally surface the applied limits and grapheme metadata
- Breaking: no
- Claude impact: Analysis surfaces can keep using code-unit offsets, but may opt into the new grapheme offsets and `surfaceSpans` table for more exact hover/selection overlays
- Gemini impact: VerseIR fixtures, compiler snapshots, and rhyme-astrology compiler payload assertions can include the new optional metadata and surface span structures

---

## SCHEMA CHANGE NOTICE

- Schema: Phonemic Oracle contract
- Version: 1.12 -> 1.13
- Changed fields: added `OracleInsight`, `OracleSuggestion`, and `OraclePayload`; `/api/analysis/panels` response may include `oracle: OraclePayload | null`
- Breaking: no
- Claude impact: Analysis surfaces should render the new `oracle` commentary and suggestions when present
- Gemini impact: panel-analysis fixtures can assert the new optional `oracle` payload

---

## SCHEMA CHANGE NOTICE

- Schema: VerseIR Synapse Slot contract
- Version: 1.11 -> 1.12
- Changed fields: added `VerseIRAmplifierArchetype`, `VerseIRAmplifierMatch`, `VerseIRAmplifierResult`, and `VerseIRAmplifierPayload`; `VerseIR` can now optionally expose `semanticDepth`, `archetypeResonance`, `elementMatches`, and `verseIRAmplifier`; `/api/analysis/panels` may include `analysis.verseIRAmplifier`
- Breaking: no
- Claude impact: Read analysis surfaces may render the optional Synapse Slot payload when present, but existing consumers remain valid without changes
- Gemini impact: panel-analysis fixtures can assert the new optional payload and combat scoring fixtures may observe the new `verseir_amplifier` trace when combat services attach VerseIR amplifier context

---

## Precedence

- This file is the active shared contract for schemas and runtime payloads.
- If this file conflicts with anything under `ARCHIVE REFERENCE DOCS/`, this file and `VAELRIX_LAW.md` win.
- If a shape is missing, escalate and have Codex publish it here before it spreads across multiple files.

---

## Global UI Constants

These constants define mandatory semantic tiers for UI rendering.

```ts
/** 
 * MANDATORY STACKING TIERS (VAELRIX LAW 10)
 * Hardcoded z-indexes > 1 are prohibited.
 */
enum StackingTier {
  Z_BASE    = 0,    // Standard page content, static backgrounds
  Z_ABOVE   = 10,   // Elements floating above content (tooltips, small menus)
  Z_OVERLAY = 100,  // Full-screen overlays, modals, intrusive selection screens
  Z_SYSTEM  = 1000  // Critical system elements (toasts, debug badges, errors)
}
```

---

## Core Schemas

These are the current shared shapes used across `codex/core/`, `src/types/`, and bridge hooks.

```ts
type BytecodeXPSourceKind = "error" | "health" | "cccb";

type MemoryCellFamily = "health" | "error" | "runtime" | "schema" | "render" | "qa" | "immunity";
type MemoryCellMode = "baseline" | "antigen";
type MemoryCellOsmosisStatus = "silent" | "anomaly";
type MemoryCellAnomalyKind = "none" | "baseline_drift" | "antigen_match" | "concentration";

interface MemoryCellVectorPacket {
  algorithm: "turboquant-js";
  dimensions: 128;
  seed: number;
  dataB64: string;            // base64 encoding of TurboQuant Uint8Array data
  norm: number;               // original vector norm emitted by TurboQuant
  checksum: string;           // sha256 over algorithm, dimensions, seed, dataB64, norm
}

interface MemoryCellMembrane {
  similarityFloor: number;    // clamped 0..1; baseline minimum or antigen activation floor
  driftCeiling: number;       // clamped 0..1; baseline drift activation ceiling
  concentrationLimit: number; // clamped 0..1; cascade activation limit
}

interface MemoryCellPacket {
  contract: "SCHOL-MEMCELL-v1";
  schemaVersion: "0.1.0";
  id: string;
  family: MemoryCellFamily;
  mode: MemoryCellMode;
  vector: MemoryCellVectorPacket;
  membrane: MemoryCellMembrane;
  sourceBytecode: string | null;
  stableContext: Record<string, unknown>;
  checksum: string;           // sha256 over all stable packet fields except checksum
}

interface MemoryCellOsmosisObservation {
  vector?: number[] | Float32Array;
  quantized?: MemoryCellVectorPacket;
  bugReport?: {
    symptoms?: string[];
    filePaths?: string[];
    layerHint?: string | null;
    layer?: string | null;
    errorMessages?: string[];
    errorMessage?: string;
  };
  concentration?: number;     // caller-supplied local signal concentration, clamped 0..1
  sourceBytecode?: string | null;
}

interface MemoryCellOsmosisResult {
  contract: "SCHOL-MEMCELL-OSMOSIS-v1";
  schemaVersion: "0.1.0";
  cellId: string;
  status: MemoryCellOsmosisStatus;
  anomalyKind: MemoryCellAnomalyKind;
  similarity: number;
  drift: number;
  concentration: number;
  confidence: number;
  checksum: string;
  bytecodeError?: string;     // PB-ERR-v1 when evaluation fails before a valid result
}

/*
Memory Cell Osmosis invariants:
- Memory cells are passive anomaly receptors. They never recommend repairs,
  mutate their vector memory, or become client-authoritative.
- `baseline` mode flags drift when similarity falls below `similarityFloor`
  or drift rises above `driftCeiling`.
- `antigen` mode flags known-bad resonance when similarity meets or exceeds
  `similarityFloor`.
- `concentrationLimit` may flag cascades independent of vector similarity.
- Packet and result checksums exclude wall-clock time, runtime duration, and
  volatile probe metadata.
- Raw user-authored scroll content must not be stored in `stableContext`.
- Malformed packet construction or evaluation failures use `PB-ERR-v1` under
  the IMMUNE/VECTOR modules; successful anomaly results are structured data,
  not errors by themselves.
*/

// QBIT-Voxel Level 3 (The World) — multi-chunk world packet.
// Implements PDR `2026-06-16-qbit-voxel-level3-multi-biome-pdr.md` §3.3.
// The world is a lazy Map<"cx,cy,cz", VoxelVolume>. Generation is
// deterministic from (spec, chunkCoords). Cross-chunk energy propagation
// uses the φ-scaled overlap radius `⌊16φ⌋ = 25` to dissolve the
// energy-field seam. The seed-layer seam is impossible by construction
// (every Wand formula type is a pure function of world coordinates, per
// the continuity principle in the PDR §3.4).
interface ChunkedWorldVolumeSpec {
  contract: "PB-WORLD-v1";
  schemaVersion: "1.0.0";
  chunkSize: { w: number; h: number; d: number };   // power of 2, 8..128
  chunkCount: { x: number; y: number; z: number }; // each ≥ 1
  formula: WandFormulaComposite;                   // see below
  seed: number;                                   // integer
  overlapRadius?: number;                         // default ⌊16φ⌋ = 25
  attenuationModel?: "gaussian" | "inverse_square" | "phi_attenuation";
                                                  // default "inverse_square"
  energyTypeMix?: Record<EnergyType, number>;     // reserved for Level 5
}

// Composite Wand formula grammar. Children are themselves world-continuous
// formulas (PDR §3.4), each scoped to a sub-region of the XZ plane. The
// composite is piecewise-continuous in world coordinates with discontinuities
// only at declared `region` boundaries. Region overlap is rejected at
// parse time with PB-ERR-v1-FORMULA-CR-COMPOSITE-OVERLAP-0001.
interface WandFormulaComposite {
  type: "composite";
  children: WandFormulaRegion[];
  region: "rect" | "voronoi";
}

interface WandFormulaRegion {
  type: "fibonacci" | "fractal_iter" | "parametric_curve" | "grid_projection" | "vectorized_text" | "composite";
  region:
    | { x: number; z: number; width: number; depth: number }  // rect
    | { seed: { x: number; z: number }; radius: number };   // voronoi disc
  energyType: number;   // ENERGY_TYPES index (0=RESONANT .. 7=RADIANT)
  params: Record<string, number | string>;
}

interface ChunkedWorldVolume {
  contract: "PB-WORLD-v1";
  schemaVersion: "1.0.0";
  spec: ChunkedWorldVolumeSpec;
  chunks: Map<string, VoxelVolume>;  // key: "cx,cy,cz"
  worldEnergyField: Float32Array | null;  // sparse, lazily assembled
  fingerprint: string;  // FNV-1a of canonicalized spec
  checksum: string;     // FNV-1a of canonicalized JSON
}

type EnergyType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
// 0=RESONANT, 1=PHOTONIC, 2=STRUCTURAL, 3=THERMAL,
// 4=KINETIC, 5=ENTROPIC, 6=SHIELDING, 7=RADIANT

// PixelBrain item voxel lift contracts.
// `VoxelVolume` is the in-memory buffer emitted as `forgeItemAsset().volume`.
// It is not a JSON persistence boundary. `PB-VOXEL-ITEM-v1` is the serialized
// item voxel artifact emitted as `forgeItemAsset().voxelPacket`.
interface VoxelVolume {
  width: number;              // positive integer
  height: number;             // positive integer
  depth: number;              // positive integer
  cells: Uint16Array;         // cell material id in upper 12 bits; flags in lower 4 bits
  energyField: Float32Array;  // same length as cells; each value clamped 0..1
  energyTypes: Uint8Array;    // same length as cells; values match EnergyType
  tags: Map<string, unknown>;
  diagnostics?: {
    amp: "pixelbrain.volume-lift-amp";
    version: string;
    cellCount: number;
    voxelCount: number;
    centrePlane: number;
  };
}

interface PixelBrainItemVoxelMaterial {
  id: string;                 // stable material table id, e.g. "mat1"
  colorHint?: string;         // optional uppercase "#RRGGBB" source-palette hint
  registryMaterialId?: string | null;
  source?: "registry" | "source-palette" | "generated" | "unknown";
}

interface PixelBrainItemVoxel {
  x: number;                  // integer, 0 <= x < dimensions.width
  y: number;                  // integer, 0 <= y < dimensions.height
  z: number;                  // integer, 0 <= z < dimensions.depth
  materialId: number;         // positive integer; 0 is reserved for empty
  energy?: number;            // optional, clamped 0..1
  energyType?: EnergyType;    // required when energy is present
}

interface PixelBrainItemVoxelPacket {
  contract: "PB-VOXEL-ITEM-v1";
  schemaVersion: "0.1.0";
  id: string;                 // source ITEM-SPEC-v1 id or stable artifact id
  bytecode: string | null;    // source item bytecode, not a PB-VOXEL checksum
  dimensions: {
    width: number;            // positive integer
    height: number;           // positive integer
    depth: number;            // positive integer
  };
  pivots?: Record<string, { x: number; y: number; z: number }>;
  materials: Record<string, PixelBrainItemVoxelMaterial>;
  voxels: PixelBrainItemVoxel[]; // occupied voxels only, sorted by y -> z -> x
}

type SilhouetteBlueprintView = "front" | "side" | "top";

interface SilhouetteBlueprintAnimationPose {
  phase: string;
  rotateDeg: number;          // integer-snapped Z/front-plane rotation peak
}

interface SilhouetteBlueprintAnimation {
  id: string;
  durationMs: number;
  loop: number | "infinite";
  poses: SilhouetteBlueprintAnimationPose[];
}

interface SilhouetteBlueprintViewContour {
  contour: [number, number][]; // closed integer polygon in the view lattice
  maskDigest: string;          // sha256 over canonical filled mask keys
}

interface SilhouetteBlueprint {
  contract: "PB-SILH-BLUEPRINT-v1";
  schemaVersion: "0.1.0";
  id: string;
  source: string | null;
  grid: {
    width: number;            // matches voxelPacket.dimensions.width
    height: number;           // matches voxelPacket.dimensions.height
    depth: number;            // matches voxelPacket.dimensions.depth
  };
  snap: "integer";
  tolerance: Record<SilhouetteBlueprintView, number>;
  views: Record<SilhouetteBlueprintView, SilhouetteBlueprintViewContour>;
  animation: SilhouetteBlueprintAnimation | null;
  digest: string;             // sha256(canonicalStringify(blueprint_without_digest))
}

interface PixelBrainCraftGateAudit {
  id: string;
  target:
    | "itemSpec"
    | "route"
    | "lattice"
    | "construction"
    | "silhouetteReadability"
    | "pixelLogic"
    | "materialAuthority"
    | "determinism"
    | "volume"
    | "voxelPacket"
    | "silhouetteBlueprint"
    | "silhouetteAnimation"
    | "export";
  severity: "FATAL" | "CRIT" | "WARN" | "INFO";
  ok: boolean;
  message: string;
  bytecodeError?: string;     // PB-ERR-v1 when ok=false
  evidence?: Record<string, unknown>;
}

interface PixelBrainCraftGateReport {
  contract: "pixelbrain.craft-gate.v1"; // CLI/internal report, not a persisted bytecode family
  schemaVersion: "0.1.0";
  source: {
    path: string | null;
    specId: string | null;
    artifactKind: "ITEM-SPEC-v1" | "pixelbrain.asset.v1" | "PB-VOXEL-ITEM-v1";
  };
  strict: boolean;
  status: "pass" | "fail";
  summary: {
    audits: number;
    failures: number;
    warnings: number;
    fatal: number;
  };
  audits: PixelBrainCraftGateAudit[];
  bytecodeErrors: string[];   // extracted PB-ERR-v1 failures for immune memory
}

interface PixelBrainPipelineCorpusCase {
  id: string;                  // stable corpus case id, e.g. "gate.bad-voxel-sort"
  type: "mutation" | "golden";
  status: "pass" | "fail";
  expected: {
    status?: "pass" | "fail";
    auditId?: string;
    invariant?: string;
  };
  observed: Record<string, unknown>;
  bytecodeErrors: string[];    // PB-ERR-v1 values extracted from nested gate reports
}

interface PixelBrainPipelineCorpusReport {
  contract: "pixelbrain.pipeline-corpus.v1"; // CLI/internal report, not a persisted bytecode family
  schemaVersion: "0.1.0";
  status: "pass" | "fail";
  summary: {
    cases: number;
    passed: number;
    failed: number;
  };
  cases: PixelBrainPipelineCorpusCase[];
  bytecodeErrors: string[];
}

/*
PixelBrain item voxel invariants:
- `VoxelVolume` is process memory only. It may contain typed arrays and maps and must not be persisted as JSON.
- `PixelBrainItemVoxelPacket` is the transport/persistence boundary for lifted item voxels.
- `voxels` contains occupied voxels only. Empty cells are represented by absence, never by `materialId: 0`.
- `voxels` order is canonical: ascending `y`, then ascending `z`, then ascending `x`.
- Every voxel coordinate is integer and within `dimensions`.
- Every `materialId` is a positive integer and must resolve to `materials[String(materialId)]`.
- `materials[*].colorHint`, when present, must be uppercase `#RRGGBB` and must trace to a registry anchor or to the source-palette quantization produced by the foundry bridge.
- `energy` and `energyType` travel as a pair. If one is present, the other is required. `energy` is clamped `0..1`; `energyType` must be one of `EnergyType`.
- VolumeLiftAMP may read only `EnergyType.STRUCTURAL` (`2`) to create depth. RADIANT/PHOTONIC channels may be carried for emission but cannot add mass.
- `PixelBrainCraftGateReport` is the report shape for the planned CLI gate. It does not reserve `PB-FORGE-GATE-v1`; failures continue to use `PB-ERR-v1`, and learned cures may use `PB-XP-v1`.
- `PixelBrainPipelineCorpusReport` is the internal mutation/golden corpus envelope. It does not reserve `PB-CORPUS-v1`; forge mutation evidence continues to flow through nested `PB-ERR-v1` craft-gate failures.
*/

/*
PixelBrain silhouette blueprint invariants:
- `SilhouetteBlueprint` is the serialized `.silh` contract for item silhouette intent.
- `PB-SILH-BLUEPRINT-v1` is a contract marker, not a new bytecode family. No `PB-SILH-*` encoder or persisted bytecode family is reserved.
- Blocking blueprint, projection, mould, or animation failures continue to use `PB-ERR-v1`; successful immunity passes may emit `PB-XP-v1`.
- The digest excludes only the `digest` field itself and hashes canonical key-sorted JSON for all other blueprint fields, including tolerance and animation poses.
- `grid` maps exactly to `voxelPacket.dimensions`: width -> x, height -> y, depth -> z.
- `front` shadows collapse z into `(x,y)`, `side` shadows collapse x into `(z,y)`, and `top` shadows collapse y into `(x,z)`.
- `front` is the v1 forge mould and may require exact tolerance `0`; `side` and `top` are inspector views unless a later schema version authorizes side/top moulding.
- Every contour point is an integer pair inside or on the intended view lattice and is filled by deterministic even-odd winding before comparison.
- Animation verification applies the same deterministic transform to both the voxel solid and the sealed shadow, then checks Hamming tolerance plus rigid invariants such as voxel-count conservation and single connected component.
*/

/*
`.silh` grammar law:
- A valid blueprint starts with `SILH_START` and ends with `SILH_END`.
- Legal form directives are `ID`, `SOURCE`, `GRID w h d`, `SNAP integer`, `TOLERANCE front N side N top N`, `VIEW front|side|top`, and `CONTOUR x,y ...`.
- A valid blueprint must include exactly the canonical three views: `front`, `side`, and `top`.
- Optional animation is delimited by `ANIM_START` and `ANIM_END` and delegates motion vocabulary to the existing animation blueprint parser. v1 gate consumers normalize it to `{ id, durationMs, loop, poses }`.
- Legal guard directives are `CONSTRAINT DETERMINISTIC true` and `QA INVARIANT <name>`.
- No live AI, network, wall-clock time, `Math.random`, PNG render, or shader output may be used as gate authority after the `.silh` artifact is sealed.
*/

interface ScholoCandyEqPreset {
  version: 2;
  schema_id: "scholomance/eq-preset";
  name: string;
  school: School | null;
  output_gain_db: number;
  bands: Array<{
    id: string; // "band_{base32}"
    type: "bell" | "lowShelf" | "highShelf" | "lowPass" | "highPass" | "notch" | "bandPass" | "allPass" | "tilt";
    frequency: number;
    gain: number;
    Q: number;
    channel: "left" | "right" | "stereo" | "mid" | "side";
    oversample: "1x" | "2x" | "4x" | "8x" | "auto";
    bypass: boolean;
  }>;
  oversample: "1x" | "2x" | "4x" | "8x" | "auto";
  analyzer: {
    enabled: boolean;
    peak_hold_ms: number;
  };
  bytecode: string; // "BIT-EQ-v1-{crc32}"
  checksum: string; // 64-char sha256
}

interface BytecodeXPVaccineArtifact {
  version: "v1";
  bytecode: string;        // PB-XP-v1-{SOURCE_KIND}-{SLUG}-{FINGERPRINT}-{CHECKSUM}
  vaccineId: string;
  sourceKind: BytecodeXPSourceKind;
  sourceBytecode: string | null;
  semanticSlug: string;
  fingerprint: string;
  recoveryKey: string | null;
  stableContext: Record<string, unknown>;
  checksum: string;
}

interface QbitPulseNodeArtifact {
  qbitType: "BYTECODE_XP_VACCINE_PULSE";
  vaccineId: string;
  origin: {
    path: string | null;
    code: string | null;
    cellId: string | null;
  };
  pulseRadius: number;          // clamped 0..1
  collapseConfidence: number;   // clamped 0..1
  hotspots: Array<{
    path: string;
    resonance: number;          // clamped 0..1
    reason: string;
  }>;
  checksum: string;
}

interface QbitProbeEnrichmentArtifact {
  hypothesis: string | null;
  hotspots: QbitPulseNodeArtifact["hotspots"];
  metadata: {
    probe?: "cleri-probe";
    skipped?: boolean;
    reason?: string;
    timedOut?: boolean;
    scannedFiles?: number;
    maxFiles?: number;
    maxFileBytes?: number;
    maxHotspots?: number;
    maxRuntimeMs?: number;
    minResonance?: number;
  };
}

interface BytecodeXPMemoryEnvelope {
  schema: "SCHOL-BYTXP-MEM-v1";
  artifactKind: "BYTECODE_XP_MEMORY_INFUSION";
  memoryKey: string;            // scholomance:bytecode-xp:{vaccineId}
  vaccine: BytecodeXPVaccineArtifact;
  pulse: QbitPulseNodeArtifact | null;
  enrichment: QbitProbeEnrichmentArtifact | null;
  labels: string[];
  provenance: {
    source: string;
    pdr: string;
    phase: string;
    createdBy: string;
  };
  checksum: string;
}

interface Scroll {
  id: string; // "scroll-{timestamp}-{7char}"
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
  submittedAt?: number | null;
  authorId: string;
}

interface PhonemeAnalysis {
  vowelFamily: VowelFamily;
  phonemes: string[];
  coda: string | null;
  rhymeKey: string;
}

interface Diagnostic {
  start: number;
  end: number;
  severity: DiagnosticSeverity;
  message: string;
  source?: string;
  metadata?: Record<string, unknown>;
}

interface ScoreTrace {
  heuristic: string;
  rawScore: number;
  weight: number;
  contribution: number;
  explanation: string;
  commentary?: string;
  diagnostics?: Diagnostic[];
}

interface CombatAction {
  scrollId: string;
  lines: string[];
  timestamp: number;
  playerId: string;
}

interface CombatResult {
  damage: number;
  statusEffects: string[];
  resourceChanges: Record<string, number>;
  explainTrace: ScoreTrace[];
}

interface XPEvent {
  source: string;
  amount: number;
  timestamp: number;
  playerId: string;
  context?: string | Record<string, unknown>;
}

interface Definition {
  text: string;
  partOfSpeech: string;
  source: string;
}

interface LexicalEntry {
  word: string;
  definition: Definition | null;
  definitions: string[];
  pos: string[];
  synonyms: string[];
  antonyms: string[];
  rhymes: string[];
  slantRhymes: string[];
  etymology?: string;
  pronunciation?: string;
  lore?: Record<string, unknown>;
  raw?: unknown;
}

interface TokenGraphNode {
  id: string;
  token: string;
  normalized: string;
  nodeType: "LEXEME" | "SCROLL_TOKEN" | "SCHOOL_ANCHOR" | "SEMANTIC_ANCHOR";
  schoolBias: Partial<Record<School, number>>;
  phoneticSignature?: {
    phonemes: string[];
    vowelSkeleton: string[];
    consonantSkeleton: string[];
    endingSignature: string;
    onsetSignature: string;
    stressPattern: string;
    syllableCount: number;
  };
  semanticTags?: string[];
  frequencyScore?: number;
}

interface TokenGraphEdge {
  id: string;
  fromId: string;
  toId: string;
  relation:
    | "PHONETIC_SIMILARITY"
    | "SEMANTIC_ASSOCIATION"
    | "SYNTACTIC_COMPATIBILITY"
    | "SCHOOL_RESONANCE"
    | "MEMORY_AFFINITY"
    | "SEQUENTIAL_LIKELIHOOD";
  weight: number;
  evidence: string[];
  dimensions?: Record<string, number>;
}

interface ContextActivation {
  anchorNodeIds: string[];
  currentSchool: School | null;
  syntaxContext: {
    role?: string;
    lineRole?: string;
    stressRole?: string;
    rhymePolicy?: string;
  } | null;
  decay: number;
  maxDepth: number;
  maxFanout: number;
}

interface CollabAgent {
  id: string;
  name: string;
  role: "ui" | "backend" | "qa";
  framework_origin?: string; // e.g. "native", "langchain", "autogen"
  capabilities: string[];
  status: "online" | "busy" | "offline";
  current_task_id?: string | null;
  last_seen: string; // ISO-8601
  metadata: Record<string, unknown>;
}

interface CollabBugReport {
  id: string;
  title: string;
  summary?: string;
  status: "new" | "triaged" | "assigned" | "in_progress" | "fixed" | "verified" | "closed" | "duplicate";
  priority: number;
  source_type: "human" | "runtime" | "qa" | "pipeline" | "agent";
  severity?: "INFO" | "WARN" | "CRIT" | "FATAL";
  bytecode?: string;
  solution_bytecode?: string;
  solution_ledger_status?: "pending" | "active" | "flagged";
  corroborating_agents?: string[];
  created_at: string;
  updated_at: string;
}

interface GraphCandidate {
  nodeId: string;
  token: string;
  activationScore: number;
  legalityScore: number;
  semanticScore: number;
  phoneticScore: number;
  schoolScore: number;
  noveltyScore: number;
  totalScore: number;
  trace: ScoreTrace[];
}

interface RitualPredictionAnchorToken {
  token: string;
  weight: number;
}

interface RitualPredictionLineVowelFamily {
  id: string;
  count: number;
}

interface RitualPredictionCurrentLineState {
  lineIndex: number;
  anchorCount: number;
  anchorWords: string[];
  dominantVowelFamily: string | null;
  vowelFamilies: RitualPredictionLineVowelFamily[];
  repeatedWindowCount: number;
  repeatedWindowIds: number[];
  repeatedWindowSignatures: string[];
  windowSyllableLengths: number[];
  terminalRhymeTailSignatures: string[];
}

interface RitualPredictionLineEndState {
  word: string;
  normalizedWord: string;
  lineIndex: number;
  tokenId: number;
  charStart: number;
  charEnd: number;
  activeWindowIds: number[];
  sign: string | null;
  rhymeTailSignature: string | null;
  primaryStressedVowelFamily: string | null;
  terminalVowelFamily: string | null;
  syllableCount: number;
  isLineStart: boolean;
  isLineEnd: boolean;
}

interface RitualPredictionVerseIRState {
  compiler: TruesightCompilerDescriptor | null;
  previousLineEnd: RitualPredictionLineEndState | null;
  currentLine: RitualPredictionCurrentLineState | null;
}

interface RitualPredictionContext {
  prefix: string;
  currentToken: string | null;
  prevToken: string | null;
  lineEndToken: string | null;
  currentLineWords: string[];
  currentSchool: School | null;
  syntaxContext: {
    role?: string;
    lineRole?: string;
    stressRole?: string;
    rhymePolicy?: string;
    hhm?: Record<string, unknown>;
  } | null;
  verseIRState: RitualPredictionVerseIRState | null;
  anchorTokens: RitualPredictionAnchorToken[];
  decay: number;
  maxDepth: number;
  maxFanout: number;
  maxCandidates: number;
}

interface RitualPredictionCandidate extends GraphCandidate {
  connectedness: number;
  pathCoherence: number;
  path: {
    nodeId: string;
    activationScore: number;
    pathNodes: string[];
    pathEdges: TokenGraphEdge[];
  };
}

interface RitualPredictionContextSnapshot {
  prefix: string;
  currentToken: string | null;
  prevToken: string | null;
  lineEndToken: string | null;
  currentSchool: School | null;
  currentLineWords: string[];
  maxDepth: number;
  maxFanout: number;
  maxCandidates: number;
  verseIRState: {
    compiler: TruesightCompilerDescriptor | null;
    previousLineEnd: {
      normalizedWord: string | null;
      lineIndex: number | null;
      rhymeTailSignature: string | null;
    } | null;
    currentLine: {
      lineIndex: number | null;
      dominantVowelFamily: string | null;
      repeatedWindowCount: number;
    } | null;
  } | null;
}

interface RitualPredictionCandidateSummary {
  token: string;
  totalScore: number;
  activationScore: number;
  legalityScore: number;
  semanticScore: number;
  phoneticScore: number;
  schoolScore: number;
  noveltyScore: number;
  connectedness: number;
  pathCoherence: number;
  pathNodeIds: string[];
  sourceRelations: TokenGraphEdge["relation"][];
}

interface RitualPredictionDiagnostic {
  source: string;
  severity: "info" | "warn" | "error";
  message: string;
}

interface PredictionPixelBrainProjection {
  version: string;
  candidateCount: number;
  paletteCount: number;
  dominantAxis: "horizontal" | "vertical" | "diagonal" | "radial";
  dominantSymmetry: "none" | "horizontal" | "vertical" | "radial";
  canvas: {
    width: number;
    height: number;
    gridSize: number;
    goldenPoint: {
      x: number;
      y: number;
    };
  };
  palettes: PixelBrainPalette[];
  coordinates: PixelBrainCoordinate[];
}

interface RitualPredictionArtifact {
  version: string;
  requestHash: string;
  traceChecksum: string;
  context: RitualPredictionContextSnapshot;
  winner: RitualPredictionCandidateSummary | null;
  candidates: RitualPredictionCandidateSummary[];
  diagnostics: RitualPredictionDiagnostic[];
  pixelbrainProjection: PredictionPixelBrainProjection;
}

interface EntropyOracleRequest {
  filePath: string;
  proposedChange: string;
  contextBlocks: string[];
}

interface EntropyOracleNode {
  type: string;
  identifier: string;
  complexityScore: number;
  inboundEdges: number;
  outboundEdges: number;
}

interface EntropyOracleVolatilityReport {
  timestamp: number;
  filePath: string;
  volatilityScore: number;
  thresholdExceeded: boolean;
  criticalRisks: string[];
  nodesAffected: EntropyOracleNode[];
  actionRecommendation: "PROCEED" | "REFACTOR" | "REJECT";
}

// Reserved export family for future persisted/shared ritual prediction artifacts.
// Runtime callers currently exchange structured RitualPredictionArtifact objects.
type RitualPredictionBytecodeFamily = "PB-PRED-v1";

interface TruesightCompilerDescriptor {
  verseIRVersion: string;
  mode: TruesightAnalysisMode;
  tokenCount: number;
  lineCount: number;
  maxWindowSyllables?: number;
  maxWindowTokenSpan?: number;
  syllableWindowCount: number;
  lineBreakStyle: LineBreakStyle;
  offsetSemantics?: string;
  graphemeAware?: boolean;
  graphemeCount?: number;
  whitespaceFidelity: boolean;
}

interface VerseNormalizationPolicy {
  lowercase: boolean;
  unicodeForm: "none" | "NFC" | "NFD" | "NFKC" | "NFKD";
  accentFolding: boolean;
}

interface VerseSurfaceSpanIR {
  id: number;
  lineIndex: number;
  surfaceIndexInLine: number;
  kind: "word" | "whitespace" | "punctuation";
  text: string;
  tokenId: number | null;
  charStart: number;
  charEnd: number;
  graphemeStart: number;
  graphemeEnd: number;
}

interface VerseLineIR {
  lineIndex: number;
  text: string;
  normalizedText: string;
  tokenIds: number[];
  charStart: number;
  charEnd: number;
  graphemeStart: number;
  graphemeEnd: number;
  lineBreak: string;
  lineBreakStart: number;
  lineBreakEnd: number;
  rawSlice: string;
  isTerminalLine: boolean;
}

interface PhoneticDiagnosticTrail {
  source: string;
  branch: string;
  fallbackPath: string[];
  authoritySource: string | null;
  usedAuthorityCache: boolean;
  unknownReason: string | null;
  notes: string[];
}

interface VerseTokenVisualBytecode {
  version: number;
  school: School | null;
  rarity: string;
  color: string;
  glowIntensity: number;
  saturationBoost: number;
  syllableDepth: number;
  isAnchor: boolean;
  isStopWord: boolean;
  effectClass: string;
}

interface VerseIRTrueVisionBand {
  id: string;
  label: string;
  centerHz: number;
  energy: number;
}

interface VerseIRTrueVisionTokenBytecode {
  symbol: string;
  dominantBand: string | null;
  bandEnergy: number;
  modulationDepth: number;
  synchronousLock: number;
  noiseFloor: number;
  noiseSuppression: number;
  confidence: number;
  onsetSharpness: number;
  codaDamping: number;
  spectralTilt: number;
  windowCoupling: number;
}

interface WordAnalysis {
  word: string;
  normalizedWord: string;
  lineIndex: number;
  wordIndex: number;
  charStart: number;
  charEnd: number;
  vowelFamily: string | null;
  syllableCount: number;
  rhymeKey: string | null; // Terminal rhyme signature from VerseTokenIR. Null for stop words and unanalyzed tokens. Required for rhyme color registry.
  stressPattern: string;
  role: string;
  lineRole: string;
  stressRole: string;
  rhymePolicy: string;
  visualBytecode?: VerseTokenVisualBytecode | null;
  trueVisionBytecode?: VerseIRTrueVisionTokenBytecode | null;
}

interface VerseIRTrueVisionWindowSummary {
  windowId: number;
  signature: string;
  dominantBand: string | null;
  tokenSpan: [number, number];
  lineSpan: [number, number];
  modulationDepth: number;
  synchronousLock: number;
  confidence: number;
}

interface VerseIRTrueVisionPayload {
  version: string;
  tokenCount: number;
  trackedTokenCount: number;
  dominantBand: VerseIRTrueVisionBand | null;
  bandDistribution: VerseIRTrueVisionBand[];
  synchronousLock: number;
  modulationDepth: number;
  noiseFloor: number;
  noiseSuppression: number;
  confidence: number;
  salientWindows: VerseIRTrueVisionWindowSummary[];
}

interface VerseTokenIR {
  id: number;
  text: string;
  normalized: string;
  normalizedUpper: string;
  lineIndex: number;
  tokenIndexInLine: number;
  globalTokenIndex: number;
  charStart: number;
  charEnd: number;
  graphemeStart: number;
  graphemeEnd: number;
  syllableCount: number;
  phonemes: string[];
  stressPattern: string;
  onset: string[];
  nucleus: string[];
  coda: string[];
  vowelFamily: string[];
  primaryStressedVowelFamily: string | null;
  terminalVowelFamily: string | null;
  rhymeTailSignature: string;
  consonantSkeleton: string;
  extendedRhymeKeys: string[];
  flags: {
    isLineStart: boolean;
    isLineEnd: boolean;
    isStopWordLike: boolean;
    unknownPhonetics: boolean;
  };
  phoneticDiagnostics?: PhoneticDiagnosticTrail | null;
  visualBytecode?: VerseTokenVisualBytecode | null;
  trueVisionBytecode?: VerseIRTrueVisionTokenBytecode | null;
}

interface SyllableWindowIR {
  id: number;
  tokenSpan: [number, number];
  lineSpan: [number, number];
  charStart: number;
  charEnd: number;
  graphemeStart: number;
  graphemeEnd: number;
  syllableLength: number;
  phonemeSpan: string[];
  vowelSequence: string[];
  stressContour: string;
  codaContour: string;
  signature: string;
}

interface OracleInsight {
  id: string;
  category: "TECHNICAL" | "ARCANE" | "STRATEGIC" | "WARNING";
  message: string;
  evidence?: string[];
  scoreImpact?: number;
}

interface OracleSuggestion {
  original: string;
  suggested: string;
  reason: string;
  resonanceGain: number;
}

interface OraclePayload {
  version: string;
  persona: string;
  mood: "ENLIGHTENED" | "CRITICAL" | "OBSERVANT" | "AWE";
  summary: string;
  insights: OracleInsight[];
  suggestions: OracleSuggestion[];
}

interface VerseIRAmplifierArchetype {
  id: string;
  label: string;
  score: number;
}

interface VerseIRAmplifierMatch {
  id: string;
  label: string;
  hits: number;
  score: number;
  coverage: number;
  lineSpread: number;
  tokens: string[];
}

interface VerseIRAmplifierResult {
  id: string;
  label: string;
  tier: "COMMON" | "RARE" | "INEXPLICABLE";
  claimedWeight: number;
  signal: number;
  semanticDepth: number;
  raritySignal: number;
  effectiveSignal: number;
  effectiveSemanticDepth: number;
  effectiveRaritySignal: number;
  matches: VerseIRAmplifierMatch[];
  archetypes: VerseIRAmplifierArchetype[];
  diagnostics: Diagnostic[];
  commentary: string;
  payload?: Record<string, unknown> | null;
}

interface PixelBrainPalette {
  key: string;
  bytecode: string;
  schoolId: string | null;
  rarity: string;
  effect: string;
  colors: string[];
  byteMap: Record<string, string>;
}

interface PixelBrainCoordinate {
  tokenId: number;
  token: string;
  lineIndex: number;
  bytecode: string;
  schoolId: string | null;
  rarity: string;
  effect: string;
  emphasis: number;
  x: number;
  y: number;
  z: number;
  snappedX: number;
  snappedY: number;
  paletteKey: string;
}

interface PixelBrainPayload {
  version: string;
  tokenCount: number;
  activeTokenCount: number;
  paletteCount: number;
  dominantAxis: "horizontal" | "vertical" | "diagonal" | "radial";
  dominantSymmetry: "none" | "horizontal" | "vertical" | "radial";
  canvas: {
    width: number;
    height: number;
    gridSize: number;
    goldenPoint: {
      x: number;
      y: number;
    };
  };
  palettes: PixelBrainPalette[];
  coordinates: PixelBrainCoordinate[];
}

interface VerseIRAmplifierPayload {
  version: string;
  activeAmplifiers: number;
  noveltyBudget: number;
  claimedWeight: number;
  precisionScalar: number;
  latencyMultiplier: number;
  noveltySignal: number;
  semanticDepth: number;
  raritySignal: number;
  impactMultiplier: number;
  dominantTier: "COMMON" | "RARE" | "INEXPLICABLE" | "NONE";
  dominantArchetype: VerseIRAmplifierArchetype | null;
  archetypeResonance: VerseIRAmplifierArchetype[];
  elementMatches: {
    common: VerseIRAmplifierMatch[];
    rare: VerseIRAmplifierMatch[];
    inexplicable: VerseIRAmplifierMatch[];
  };
  pixelBrain?: PixelBrainPayload | null;
  trueVision?: VerseIRTrueVisionPayload | null;
  diagnostics: Diagnostic[];
  amplifiers: VerseIRAmplifierResult[];
}

interface NarrativeAMPBeat {
  id: string;
  tone: "TECHNICAL" | "STRUCTURAL" | "ARCANE" | "REVISION";
  title: string;
  message: string;
  evidence?: string[];
  signal?: number | null;
}

interface NarrativeAMPRevision {
  original: string;
  suggested: string;
  reason: string;
  resonanceGain: number;
}

interface NarrativeAMPResonance {
  source: "VERSEIR";
  tokenCount: number;
  lineCount: number;
  activeAmplifiers: number;
  dominantTier: "COMMON" | "RARE" | "INEXPLICABLE" | "NONE";
  dominantArchetype: VerseIRAmplifierArchetype | null;
  noveltySignal: number;
  semanticDepth: number;
  raritySignal: number;
  trueVisionBand: string | null;
  trueVisionConfidence: number;
  leadingHeuristic: string | null;
  leadingContribution: number;
}

interface NarrativeAMPPayload {
  version: string;
  engine: "VERSEIR";
  narrator: string;
  mood: "ENLIGHTENED" | "CRITICAL" | "OBSERVANT" | "AWE";
  summary: string;
  beats: NarrativeAMPBeat[];
  revisions: NarrativeAMPRevision[];
  resonance: NarrativeAMPResonance;
}

interface VerseIRIndexes {
  tokenIdsByLineIndex: number[][];
  lineEndTokenIds: number[];
  tokenIdsByRhymeTail: Map<string, number[]>;
  tokenIdsByVowelFamily: Map<string, number[]>;
  tokenIdsByTerminalVowelFamily: Map<string, number[]>;
  tokenIdsByStressedVowelFamily: Map<string, number[]>;
  tokenIdsByConsonantSkeleton: Map<string, number[]>;
  tokenIdsByStressContour: Map<string, number[]>;
  windowIdsBySyllableLength: Map<number, number[]>;
  windowIdsBySignature: Map<string, number[]>;
}

interface VerseIRFeatureTables {
  tokenNeighborhoods: Array<{
    tokenId: number;
    lineIndex: number;
    prevTokenId: number | null;
    nextTokenId: number | null;
  }>;
  lineAdjacency: Array<{
    lineIndex: number;
    prevLineIndex: number | null;
    nextLineIndex: number | null;
  }>;
  summary: {
    tokenCount: number;
    lineCount: number;
    syllableWindowCount: number;
  };
}

interface VerseIR {
  version: string;
  rawText: string;
  normalizedText: string;
  lines: VerseLineIR[];
  tokens: VerseTokenIR[];
  surfaceSpans: VerseSurfaceSpanIR[];
  syllableWindows: SyllableWindowIR[];
  indexes: VerseIRIndexes;
  featureTables: VerseIRFeatureTables;
  semanticDepth?: number;
  archetypeResonance?: VerseIRAmplifierArchetype[];
  elementMatches?: VerseIRAmplifierPayload["elementMatches"];
  trueVision?: VerseIRTrueVisionPayload | null;
  verseIRAmplifier?: VerseIRAmplifierPayload | null;
  metadata: {
    mode: TruesightAnalysisMode;
    lineBreakStyle: LineBreakStyle;
    tokenCount: number;
    lineCount: number;
    maxWindowSyllables: number;
    maxWindowTokenSpan: number;
    syllableWindowCount: number;
    offsetSemantics: "code_unit_primary";
    graphemeAware: boolean;
    graphemeCount: number;
    normalization: VerseNormalizationPolicy;
    whitespaceFidelity: boolean;
  };
}

interface SerializedVerseIRIndexes {
  tokenIdsByLineIndex: Array<[number, number[]]>;
  lineEndTokenIds: number[];
  tokenIdsByRhymeTail: Array<[string, number[]]>;
  tokenIdsByVowelFamily: Array<[string, number[]]>;
  tokenIdsByTerminalVowelFamily: Array<[string, number[]]>;
  tokenIdsByStressedVowelFamily: Array<[string, number[]]>;
  tokenIdsByConsonantSkeleton: Array<[string, number[]]>;
  tokenIdsByStressContour: Array<[string, number[]]>;
  windowIdsBySyllableLength: Array<[number, number[]]>;
  windowIdsBySignature: Array<[string, number[]]>;
}

interface SerializedVerseIR extends Omit<VerseIR, "indexes"> {
  indexes: SerializedVerseIRIndexes;
}

interface RhymeAstrologyQueryCompilerContext {
  verseIRVersion: string;
  mode: TruesightAnalysisMode | string;
  tokenCount: number;
  lineCount: number;
  maxWindowSyllables?: number;
  maxWindowTokenSpan?: number;
  syllableWindowCount: number;
  lineBreakStyle: LineBreakStyle | string;
  offsetSemantics?: string;
  graphemeAware?: boolean;
  graphemeCount?: number;
  whitespaceFidelity: boolean;
  source: "provided" | "compiled";
  anchorTokenId?: number | null;
  anchorLineIndex?: number | null;
  activeTokenIds?: number[];
  activeWindowIds?: number[];
}

interface RhymeAstrologyQueryPattern {
  rawText: string;
  tokens: string[];
  resolvedNodes: Array<{
    id: string;
    token: string;
    normalized: string;
    endingSignature: string;
    onsetSignature: string;
    stressPattern: string;
    syllableCount: number;
    frequencyScore: number;
  }>;
  lineEndingSignature?: string;
  internalPattern?: string[];
  stressContour?: string;
  compiler?: RhymeAstrologyQueryCompilerContext;
}

interface RhymeAstrologyMatch {
  nodeId: string;
  token: string;
  overallScore: number;
  reasons: string[];
}

interface RhymeAstrologyConstellation {
  id: string;
  anchorId: string;
  label: string;
  dominantVowelFamily: string[];
  dominantStressPattern: string;
  members: string[];
  densityScore: number;
  cohesionScore: number;
}

interface RhymeAstrologyResult {
  query: RhymeAstrologyQueryPattern;
  topMatches: RhymeAstrologyMatch[];
  constellations: RhymeAstrologyConstellation[];
  diagnostics: {
    queryTimeMs: number;
    cacheHit: boolean;
    candidateCount: number;
  };
}

interface RhymeAstrologyAnchorCompilerRef {
  tokenId: number;
  lineIndex: number;
  tokenIndexInLine: number;
  tokenSpan: [number, number];
  activeWindowIds: number[];
  charStart: number;
  charEnd: number;
  syllableCount: number;
  stressPattern: string;
  rhymeTailSignature: string;
  primaryStressedVowelFamily: string | null;
  terminalVowelFamily: string | null;
  isLineStart: boolean;
  isLineEnd: boolean;
}

interface RhymeAstrologyInspectorAnchor {
  word: string;
  normalizedWord: string;
  lineIndex: number;
  wordIndex: number;
  charStart: number;
  charEnd: number;
  sign: string;
  dominantVowelFamily: string;
  tokenId: number;
  activeWindowIds: number[];
  compilerRef: RhymeAstrologyAnchorCompilerRef | null;
  topMatches: RhymeAstrologyMatch[];
  constellations: RhymeAstrologyConstellation[];
  diagnostics: {
    queryTimeMs: number;
    cacheHit: boolean;
    candidateCount: number;
  };
}

interface RhymeAstrologyWindowSummary {
  id: number;
  lineIndex: number;
  lineSpan: [number, number];
  tokenIds: number[];
  tokenSpan: [number, number];
  charStart: number;
  charEnd: number;
  syllableLength: number;
  signature: string;
  stressContour: string;
  codaContour: string;
  vowelSequence: string[];
  occurrenceCount: number;
  repeated: boolean;
  anchorTokenIds: number[];
  anchorWords: string[];
}

interface RhymeAstrologySpan {
  id: string;
  kind: "anchor_token" | "syllable_window";
  lineIndex: number;
  charStart: number;
  charEnd: number;
  tokenIds: number[];
  anchorTokenId: number | null;
  windowId: number | null;
  label: string;
  sign: string | null;
  clusterIds: string[];
}

interface RhymeAstrologyPanelPayload {
  enabled: boolean;
  features: {
    rhymeAffinityScore: number;
    constellationDensity: number;
    internalRecurrenceScore: number;
    phoneticNoveltyScore: number;
  } | null;
  inspector: {
    anchors: RhymeAstrologyInspectorAnchor[];
    clusters: Array<{
      id: string;
      label: string;
      anchorWord: string;
      sign: string;
      dominantVowelFamily: string[];
      dominantStressPattern: string;
      densityScore: number;
      cohesionScore: number;
      membersCount: number;
    }>;
    windows: RhymeAstrologyWindowSummary[];
    spans: RhymeAstrologySpan[];
  };
  diagnostics: {
    anchorCount: number;
    cacheHitCount: number;
    averageQueryTimeMs: number;
  };
}

interface WorldEntityRef {
  entityId: string;
  kind: "item" | "npc" | "location" | "glyph";
  lexeme?: string | null;
  roomId?: string | null;
  instanceId?: string | null;
}

interface WorldRoom {
  id: string;
  name: string;
  description: string;
  school: School | null;
  state: Record<string, unknown>;
}

interface WorldRoomEntitySummary {
  entityId: string;
  kind: "item" | "npc" | "location" | "glyph";
  lexeme: string | null;
  name: string;
  summary: string;
  roomId: string | null;
  actions: string[];
  school: School | null;
  rarity: string;
  inspectCount: number;
}

interface WorldRoomSnapshot {
  room: WorldRoom | null;
  entities: WorldRoomEntitySummary[];
}

interface InspectableEntity {
  ref: WorldEntityRef;
  title: string;
  summary: string | null;
  codex: {
    word: string | null;
    headword: string;
    definition: string | null;
    partOfSpeech: string | string[] | null;
    pronunciation: string | null;
    etymology: string | null;
    synonyms: string[];
    antonyms: string[];
    rhymes: string[];
    rhymeFamily: string | null;
    tags: string[];
    school: School | null;
    loreSeed: string | null;
  };
  mud: {
    entityType: string;
    rarity: string;
    school: School | null;
    roomId: string | null;
    roomName: string | null;
    actions: string[];
    state: Record<string, unknown>;
    ownership: string | number | null;
    inspectCount: number;
    flavorText: string;
  };
  room: WorldRoom | null;
}

interface InspectWorldEntityActionResponse {
  action: "inspect";
  entity: InspectableEntity;
  performedAt: string;
}

interface TaskAssignmentPreflightConflict {
  kind: "ownership" | "lock";
  file: string;
  reason: string;
  owner_role?: "ui" | "backend" | "qa" | null;
  assigned_role?: "ui" | "backend" | "qa" | null;
  locked_by?: string | null;
  task_id?: string | null;
}

interface TaskAssignmentPreflightResponse {
  valid: boolean;
  requires_override: boolean;
  info: string | null;
  error: string | null;
  warnings: string[];
  conflicts: TaskAssignmentPreflightConflict[];
  checked_at: string; // ISO-8601 timestamp
}

interface CombatScoreRequest {
  scrollText: string;
  weave?: string;
  playerId?: string;
  arenaSchool?: School;
  opponentSchool?: School;
}

interface CombatIntent {
  healing: boolean;
  terrain: boolean;
  buff: boolean;
  debuff: boolean;
  failureDisposition: "BUFF" | "DEBUFF" | "NEUTRAL";
  speechAct?: CombatSpeechAct | null;
  intonationTag?: string | null;
  cadenceTag?: CombatCadenceTag | null;
  bridgeIntent?: string | null;
  statusEffect?: CombatStatusEffect | null;
}

type CombatSpeechAct =
  | "COMMAND"
  | "INVOCATION"
  | "THREAT"
  | "PLEA"
  | "DECLARATION"
  | "TAUNT"
  | "QUESTION"
  | "BANISHMENT"
  | "CURSE"
  | "BLESSING";

type CombatCadenceTag =
  | "RESOLVED"
  | "SUSPENDED"
  | "CLIPPED"
  | "FALLING"
  | "RISING"
  | "LEVEL"
  | "SURGING"
  | "WITHHELD";

interface WeightedCombatLabel {
  label: string;
  weight: number;
}

interface WeightedSpeechAct {
  act: CombatSpeechAct;
  weight: number;
}

interface SubemotionSignal {
  id: string;
  label: string;
  school: School | null;
  weight: number;
}

interface VoiceProfileSnapshot {
  version: number;
  speakerId: string;
  speakerType: "PLAYER" | "OPPONENT";
  school: School;
  samples: number;
  preferredSpeechAct: CombatSpeechAct;
  preferredCadence: CombatCadenceTag;
  preferredFoot: string;
  preferredSeverity: string;
  contourAverages: {
    opening: number;
    crest: number;
    closure: number;
    volatility: number;
  };
}

interface CombatSpeakingAnalysis {
  school: School | null;
  speechAct: {
    primary: CombatSpeechAct;
    confidence: number;
    topActs: WeightedSpeechAct[];
  };
  prosody: {
    dominantFoot: string;
    metricalGrid: string;
    meterName: string;
    feetPerLine: number;
    beatAlignment: number;
    controlledVariance: number;
    closureScore: number;
    deviation?: number;
    cadence: {
      dominantTag: CombatCadenceTag;
      lineTags: Array<{
        lineIndex: number;
        tag: CombatCadenceTag;
        beatAlignment: number;
      }>;
    };
  };
  intonation: {
    mode: string;
    primaryTag: CombatSpeechAct;
    contour: {
      opening: number;
      crest: number;
      closure: number;
      volatility: number;
    };
    punctuation: {
      questionCount: number;
      exclamationCount: number;
      commaCount: number;
    };
  };
  affect: {
    primaryEmotion: string;
    scores: Array<{
      emotion: string;
      weight: number;
    }>;
    subemotions: SubemotionSignal[];
  };
  harmony: {
    score: number;
    adjacentLineScore: number;
    coupletScore: number;
    stanzaScore: number;
    alliterationScore: number;
    dominantVowel: string | null;
  };
  severity: {
    ladderId: School | null;
    label: string | null;
    topLexeme: string | null;
    tierIndex: number;
    severityScore: number;
    rarityAmplifier: number;
    potency: number;
    matches: Array<{
      token: string;
      label: string;
      tierIndex: number;
      rarity: number;
    }>;
  };
  voice: {
    speakerId: string;
    speakerType: "PLAYER" | "OPPONENT";
    resonance: number;
    profile: VoiceProfileSnapshot;
  };
}

interface CombatRarity {
  id: "COMMON" | "UNCOMMON" | "GRIMOIRE" | "MYTHIC" | "LEGENDARY" | "SOURCE";
  label: string;
  minScore: number;
  bonusMultiplier: number;
  totalMultiplier: number;
  ordinal: number;
  score: number;
  praise: string;
}

interface CombatSchoolDensity {
  SONIC: number;
  PSYCHIC: number;
  VOID: number;
  ALCHEMY: number;
  WILL: number;
}

interface CombatStatusEffect {
  school: School;
  chainId: string;
  label: string;
  tier: 1 | 2 | 3 | 4 | 5;
  turns: number;
  turnsRemaining: number;
  magnitude: number;
  sourceBonus: string | null;
  disposition: "BUFF" | "DEBUFF";
  averageRarity: number;
  hitCount: number;
  matchedKeywords: string[];
}

interface CombatScoreResponse {
  damage: number;
  healing: number;
  totalScore: number;
  school: School;
  schoolDensity: CombatSchoolDensity;
  arenaSchool: School;
  opponentSchool: School | null;
  arenaResonanceMultiplier: number;
  schoolAffinityMultiplier: number;
  syntaxControlMultiplier: number;
  speechActMultiplier: number;
  prosodyMultiplier: number;
  harmonyMultiplier: number;
  severityMultiplier: number;
  voiceResonanceMultiplier: number;
  abyssalResonanceMultiplier: number;
  cohesionScore: number;
  rarity: CombatRarity;
  intent: CombatIntent;
  speaking: CombatSpeakingAnalysis | null;
  voiceProfile: VoiceProfileSnapshot | null;
  statusEffect: CombatStatusEffect | null;
  failureCast: boolean;
  commentary: string;
  traceId: string;
  traces: ScoreTrace[];
  explainTrace: ScoreTrace[];
}

interface OpponentSpell {
  spell: string;
  damage: number;
  school: School;
  traces: ScoreTrace[];
  explainTrace: ScoreTrace[];
  rarity: CombatRarity;
  schoolAffinityMultiplier: number;
  memoryLinesUsed: number;
  counterTokens: string[];
  speaking?: CombatSpeakingAnalysis | null;
  voiceProfile?: VoiceProfileSnapshot | null;
  voiceResonance?: number;
}
```

---

## Type Enumerations

```ts
type VowelFamily =
  | "A" | "AE" | "AO" | "AW" | "AY"
  | "EH" | "ER" | "EY"
  | "IH" | "IY"
  | "OH" | "OW" | "OY"
  | "UH" | "UW";

type School = "SONIC" | "PSYCHIC" | "VOID" | "ALCHEMY" | "WILL";

type DiagnosticSeverity = "info" | "warning" | "error" | "success";

type TruesightAnalysisMode = "live_fast" | "balanced" | "deep_truesight";

type LineBreakStyle = "lf" | "crlf" | "cr" | "mixed" | "none";

// QBIT-Voxel energy types — used by Wand formula regions and ChunkedWorldVolume.
// Index matches `ENERGY_TYPES` in `codex/core/pixelbrain/voxel-volume.js`.
type EnergyType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
// 0=RESONANT, 1=PHOTONIC, 2=STRUCTURAL, 3=THERMAL,
// 4=KINETIC, 5=ENTROPIC, 6=SHIELDING, 7=RADIANT
```

---

## Implemented Runtime Event Bus

This is the current runtime bus in `codex/runtime/`. It is string-event plus payload. It is not yet the structured `CODExEvent<T>` envelope described in older docs.

```ts
declare function emit(eventName: string, payload?: unknown): void;
declare function on(eventName: string, callback: (payload: unknown) => void): () => void;

type RuntimeEventName =
  | "ui:word_lookup_requested"
  | "runtime:word_lookup_result"
  | "runtime:word_lookup_result:error"
  | "ui:word_analysis_requested"
  | "ui:combat_action_submitted";

interface RuntimePayloadMap {
  "ui:word_lookup_requested": {
    word: string;
    requestId?: string;
    responseEvent?: string;
  };
  "runtime:word_lookup_result": {
    word: string;
    requestId?: string;
    data: LexicalEntry | null;
    source: string;
  };
  "runtime:word_lookup_result:error": {
    word: string;
    requestId?: string;
    error: string;
    code?: string;
  };
  "ui:word_analysis_requested": {
    word: string;
    responseEventName: string;
  };
  "ui:combat_action_submitted": {
    responseEventName: string;
    [key: string]: unknown;
  };
}
```

### Runtime Bus Rules

- `runtime:word_lookup_result:error` is emitted as `${responseEvent}:error`.
- `requestId` is the current request-correlation mechanism.
- `traceId` is a future-state concept. Do not assume it exists in runtime payloads yet.
- UI surface files do not import the runtime bus directly. Current sanctioned bridges live in Codex-owned logic hooks and providers such as `src/hooks/useCODExPipeline.jsx` and `src/hooks/useWordLookup.jsx`.

---

## Reserved Future Event Names

These names are reserved for future typed gameplay/runtime events. They are not guaranteed to be emitted by the current runtime implementation yet.

```ts
type ReservedEventName =
  | "COMBAT_PREVIEW"
  | "COMBAT_RESOLVED"
  | "XP_AWARDED"
  | "SCHOOL_UNLOCKED"
  | "SCROLL_SAVED"
  | "RATE_LIMITED"
  | "ENGINE_READY"
  | "ENGINE_ERROR";
```

Until these are implemented in the runtime, no UI or test should assume they exist.

---

## Implemented HTTP Contracts

```ts
GET /collab/tasks/:id/preflight

query params:
  agent_id: string

response body: TaskAssignmentPreflightResponse
```

Notes:
- This is the authoritative assignment compatibility check used by the Collab task drawer before `POST /collab/tasks/:id/assign`.
- `valid = true` means the current assignment can proceed without override.
- `requires_override = true` means ownership boundaries are crossed but no active file lock blocks the assignment.
- Lock conflicts are always blocking and surface in `conflicts` with `kind: "lock"`.
- `checked_at` is an ISO-8601 timestamp describing when the control plane evaluated the task against the selected agent.

```ts
POST /api/combat/score

request body: CombatScoreRequest
response body: CombatScoreResponse
```

Notes:
- `scrollText` is capped to 100 characters at the route boundary for MVP combat.
- `weave` is optional and capped to 100 characters. When present, it feeds the authoritative Syntactic Bridge / spellweave calculation.
- `playerId` is optional metadata. The current authoritative response does not depend on client-submitted damage or trace values.
- `arenaSchool` and `opponentSchool` are optional context values that let the server apply arena resonance and defender affinity consistently.
- `traces` is the canonical combat breakdown array. `explainTrace` is returned as an alias for existing consumers that still read the older field name.
- `healing` is authoritative and may accompany offensive damage for alchemical/supportive casts.
- `commentary` carries CODEx rarity praise for powerful spells.
- `abyssalResonanceMultiplier` is the average Lexicon Abyss multiplier applied from public combat speech entropy for the resolved cast.
- `traceId` is the authoritative Akashic replay handle recorded alongside the resolved cast.

```ts
GET /api/rhyme-astrology/query

query params:
  text: string
  mode?: "word" | "line"
  limit?: number
  minScore?: number
  includeConstellations?: boolean
  includeDiagnostics?: boolean

response body: RhymeAstrologyResult
```

Notes:
- The public route remains text-query based and backward compatible.
- Runtime implementations may internally compile a VerseIR substrate to resolve anchors and line/window context deterministically.
- `query.compiler` is optional and may appear when the runtime used VerseIR-backed context resolution.

```ts
POST /api/analysis/panels

request body: {
  text: string;
}

response body: {
  source: "server-analysis";
  data: {
    analysis: {
      compiler?: TruesightCompilerDescriptor | null;
      verseIRAmplifier?: VerseIRAmplifierPayload | null;
      [key: string]: unknown;
    } | null;
    rhymeAstrology: RhymeAstrologyPanelPayload | null;
    narrativeAMP: NarrativeAMPPayload | null;
    oracle: OraclePayload | null;
    [key: string]: unknown;
  };
}

Notes:
- `rhymeAstrology` is optional and feature-flag gated.
- `analysis.verseIRAmplifier` is optional and carries the Synapse Slot / VerseIR amplifier payload when the server compiled VerseIR context for the request.
- `narrativeAMP` is optional and carries the VerseIR-native narrative relay payload derived from compiler/amplifier state.
- `oracle` is optional and retained as a compatibility alias for clients that still consume the older Phonemic Oracle shape.
- When enabled, inspector anchors/windows/spans are decorative client guidance only; the server remains authoritative for scoring and persistence.

```ts
GET /api/world/rooms/:roomId

response body: WorldRoomSnapshot

GET /api/world/entities/:entityId

response body: InspectableEntity

POST /api/world/entities/:entityId/actions/inspect

request body: {
  roomId?: string;
}

response body: InspectWorldEntityActionResponse
```

Notes:
- World routes require the same session gate as lexicon browsing: an authenticated user session or a guest session established through `/auth/csrf-token`.
- `POST /api/world/entities/:entityId/actions/inspect` also requires the standard CSRF header once that session is established.
- The `codex` block describes what the object is linguistically and semantically.
- The `mud` block describes what the object is in the world right now, including inspect count, actions, and room presence.
- `GET /api/world/entities/:entityId` is non-mutating state fetch. `POST .../actions/inspect` is the authoritative interaction that increments persistent inspect count.

---

## Handoff Matrix

| If you are delivering... | Deliver to... | Format |
|--------------------------|---------------|--------|
| A new mechanic spec | Codex (to schema) + Gemini (to implement) + Claude (if UI surface needed) | `MECHANIC SPEC` block |
| A new schema or contract change | All agents | `SCHEMA CHANGE NOTICE` block |
| A new runtime event | Claude (consumer) + Gemini (fixtures/tests/impl) | Event name + payload shape |
| A failing test | Gemini (to fix) — escalate to Codex if schema-rooted, Claude if UI-rooted | `INQUISITOR REPORT` |
| A domain conflict | Angel | `ESCALATION` block |
| A visual regression | Claude (to fix) + Gemini (to gate) | `WEAVE REPORT` entry |

---

## Schema Change Notice Format

When any schema or runtime event changes, Codex issues this notice:

```text
SCHEMA CHANGE NOTICE - v[old] -> v[new] - [date]

Changed: [interface/type name]
Field: [field name]
Change: [added / removed / renamed / type changed]
Breaking: [yes / no]

Consumers affected:
- Claude: [yes/no - which component/hook reads this field]
- Gemini: [yes/no - which fixtures/tests/backend modules use this field]

Migration:
[what each affected agent needs to do]

Backward compatible until: [date or "immediate breaking change"]
```

---

## Version Log

| Version | Date | Change | Breaking |
|---------|------|--------|----------|
| 1.0 | 2026-03-10 | Initial schema contract established | no |
| 1.1 | 2026-03-10 | Aligned combat/runtime contract to implemented types and current event-bus behavior | no |
| 1.2 | 2026-03-10 | Added `POST /api/combat/score` request/response contract for server-authoritative combat scoring | no |
| 1.3 | 2026-03-10 | Expanded combat scoring payload with school/rarity/healing metadata and published `OpponentSpell` | no |
| 1.4 | 2026-03-14 | Added semantic status-effect payloads and cohesion metadata to authoritative combat scoring | no |
| 1.5 | 2026-03-16 | Added optional `weave` to `CombatScoreRequest` and aligned authoritative combat scoring with Spellweave input | no |
| 1.6 | 2026-03-16 | Added authoritative world room/entity inspection schemas and HTTP contracts | no |
| 1.7 | 2026-03-17 | Added combat speaking analysis, voice-profile snapshots, and speaking multipliers to combat payloads | no |
| 1.8 | 2026-03-21 | Added phonosemantic token-graph node/edge, activation, and graph-candidate contracts for prediction and judiciary traversal | no |
| 1.9 | 2026-03-26 | Added VerseIR compiler contracts, whitespace-fidelity line metadata, syllable windows, and optional Truesight compiler metadata for panel analysis | no |
| 1.10 | 2026-03-28 | Added compiler-aware rhyme astrology query/panel payload contracts, including VerseIR-backed anchors, windows, and spans | no |
| 1.11 | 2026-03-28 | Added abyssal resonance multiplier and Akashic trace handle to authoritative combat scoring | no |
| 1.12 | 2026-03-28 | Added VerseIR Synapse Slot amplifier payloads and optional panel-analysis exposure for semantic depth / archetype resonance | no |
| 1.13 | 2026-03-28 | Added `OracleInsight`, `OracleSuggestion`, and `OraclePayload` plus optional analysis oracle commentary payloads | no |
| 1.14 | 2026-03-28 | Hardened VerseIR with grapheme offsets, surface spans, normalization metadata, phonetic provenance, and applied window-limit metadata | no |
| 1.15 | 2026-03-29 | Added optional `Scroll.submittedAt` so autosaved drafts can be distinguished from first-time submissions | no |
| 1.16 | 2026-03-29 | Added VerseIR TrueVision travelling-wave payloads plus formalized token visual/trueVision bytecodes | no |
| 1.17 | 2026-03-29 | Added VerseIR-native `narrativeAMP` panel-analysis payloads and documented `oracle` as a compatibility alias during migration | no |
| 1.18 | 2026-03-30 | Added optional VerseIR amplifier `pixelBrain` payloads for the Phase 1 token-bytecode, coordinate, and palette bridge | no |
| 1.19 | 2026-04-01 | Added semantic global UI stacking tiers and documented the Law 10 migration requirement | no |
| 1.20 | 2026-04-03 | Added the Collab assignment preflight response shape and documented `GET /collab/tasks/:id/preflight` | no |
| 1.21 | 2026-04-04 | Added `CollabAgent` framework_origin and `CollabBugReport` experience/ledger fields | no |
| 1.22 | 2026-04-13 | Added `WordAnalysis` and documented required `rhymeKey` support for TrueSight rhyme color registry consumers | no |
| 1.23 | 2026-04-18 | Added the canonical ritual prediction runtime and artifact contracts and reserved `PB-PRED-v1` for future exported prediction bytecode | no |
| 1.24 | 2026-04-22 | Added catalog audio upload ingestion data contracts | no |
| 1.25 | 2026-05-13 | Upgraded catalog and persistence layers | no |
| 1.26 | 2026-06-07 | Added Eq Preset V2 schema and persistence endpoints | no |
| 1.27 | 2026-06-19 | Registered `PB-VOXEL-ITEM-v1`, documented the in-memory `VoxelVolume` sibling, and added the CLI-only PixelBrain craft gate report contract | no |
| 1.28 | 2026-06-19 | Registered `PB-SILH-BLUEPRINT-v1`, ratified the `.silh` grammar, and extended PixelBrain craft gate audits for silhouette blueprint and animation lockstep verification | no |
| 1.29 | 2026-06-20 | Added Memory Cell Osmosis TurboQuant receptor contracts for diagnostic-memory anomaly evaluation | no |
| 1.30 | 2026-06-29 | Added the internal PixelBrain pipeline golden corpus report contract for mutation and finish-suite corpus execution | no |

---

## Authorship

This document is maintained by Codex with Angel's awareness.
All agents read it before acting on shared data contracts.
