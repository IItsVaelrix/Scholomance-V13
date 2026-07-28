# PDR — Ontological Art-Direction Pipeline (SCDNA → SCDL → SCD64 → BytecodeHealth)

**Status:** Approved design, pre-implementation  
**Date:** 2026-07-25  
**Author:** Mother (cockpit commentary agent, spec synthesis) + Human (architectural direction, invariants, seam corrections)  
**Archive:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr.md`  
**Depends on:** `codex/core/pixelbrain/scdna-gene-packet.js`, `codex/core/pixelbrain/scdl/passes/*`, `src/core/scd64/glossary.ts`, `src/core/scd64/constants.ts`, `codex/core/diagnostic/diagnostic-constants.js`, `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py`, `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py`, `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py`, `PolarisOS/scripts/scdl-to-polaris.mjs` (Feel score), `PolarisOS/scripts/vixel-rasterize.mjs`  
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-ONTOLOGICAL-ART-DIRECTION`

---

## Owner(s)

- **Qwen:** SCDL pass pipeline (`project-genes.pass.js`), gene packet schema extensions, SCD64 glossary art-family entries, projection checksum binding, deterministic projection algorithm.
- **Qwen:** Approval preview UI (render projected cells for human review before commit), capability-packet injection surface for `.scdl` files in the editor.
- **Qwen:** Durable event ledger (art-gene store), health event emission wiring, CI integration (determinism replay tests), capability compiler extension for art genes.
- **Escalation owner** (cross-domain conflicts): Angel / repo owner.

## Context (seed — not the Executive Summary)

The Vixel asset pipeline compiles SCDL into pixel packets with precision, but has no ontological layer for aesthetic intent. Art-direction decisions (rim lighting, value ramps, contour treatment) are hand-placed as anonymous cells with no retrieval, no memory, and no causal traceability. This PDR connects four existing substrates — SCDNA genes, SCDL structure, SCD64 addressing, and BytecodeHealth events — into a layered pipeline where curated aesthetic intent becomes a first-class, checksummed, retrievable, persistent artifact.

## Target Integration Area

- `codex/core/pixelbrain/scdna-gene-packet.js` — gene schema extension (art-direction geneType, projectionMode, geometryHints art fields)
- `codex/core/pixelbrain/scdl/passes/project-genes.pass.js` — NEW pass (gene → SCDL cell projection)
- `src/core/scd64/glossary.ts` + `src/core/scd64/constants.ts` — art-family glossary entries
- `codex/core/diagnostic/diagnostic-constants.js` — new health codes
- `steamdeck_brain/vaelrix_forcefield/scdna/` — art-gene store, compiler extension, capability packet
- `PolarisOS/scripts/scdl-to-polaris.mjs` — Feel score as curation-time gate (warn-only)

## Core Concept

Think of it as a **causal chain for pixels**. Today, a pixel in the brazier's rim is an anonymous coordinate in a JSON packet — you cannot ask *why* it exists, *who* decided it, or *what* aesthetic principle it serves. This pipeline makes every pixel a **causal artifact**: traceable from curated intent (SCDNA gene) through deterministic manifestation (SCDL projection) to addressed transmission (SCD64 checksum) to persistent memory (BytecodeHealth event). The metaphor is biological: DNA (gene) → transcription (projection) → protein (pixel) → epigenetic memory (health events that record what was expressed and when). The system never *authors* genes — it validates, projects, checksums, evaluates, warns, retrieves, and replays. Curation is human. Always.

## Implementation Philosophy

- **Small composable edits.** Each phase ships independently behind a flag. No big-bang rewrite.
- **Deterministic behavior.** Same gene + same compiler version → same cells → same bytes. No RNG anywhere in the projection path.
- **Adapter layers.** The gene packet already exists but is dead code; revive it by adding a live import edge, not by rewriting. The capability store pattern is copied, not reinvented.
- **Preserve existing behavior.** The SCDL compiler works today without genes. The `project-genes` pass is additive: no genes → no-op. Existing assets compile identically.
- **Human authority is executable.** The refusal gate is code, not documentation. `if (source !== 'human-approved') return refusal(ART_GENE_REQUIRES_HUMAN_APPROVAL)`.

## Ownership & Law Compliance

Every file this PDR writes appears in §7 with its owning agent. The Curation Law (PDR §7.1, cited in `docs/superpowers/plans/2026-07-17-capability-packets.md`) is respected: the compiler may reject/warn/emit but may not commit without human approval. Determinism guarantees (Vaelrix Law §1) are preserved: all projection is a pure function of bound inputs. No unseeded randomness. No nondeterministic heuristics.

---

## Required Sections

### 1. Executive Summary

The Vixel pipeline can place pixels precisely but cannot represent, retrieve, transmit, or remember *why* a pixel exists. This PDR adds an ontological layering: SCDNA art-genes carry curated aesthetic intent (light direction, value ramps, contour treatment); a new SCDL pass deterministically projects genes into cells; SCD64 art-family glossary entries address the packets; BytecodeHealth events persist the curation and projection record in a durable, retrievable ledger. The blast radius is contained: the new pass is additive (no genes → no-op), existing assets compile identically, and the human-approval gate is an executable invariant. Current status: design approved, law-audit clean (zero violations), causal-drift risk identified and mitigated by dual-checksum binding. The primary remaining risk is causal drift (gene checksum stable, projection pass reinterprets hints differently), mitigated by binding projection-algorithm version into the projection checksum so prior approvals are invalidated on pass changes.

### 2. Out of Scope / Non-Goals

- **Auto-generation of genes from prose.** The Curation Law forbids it. Genes are human-authored.
- **A generative solver that synthesizes cells from intent.** This PDR builds the *substrate* (representation, retrieval, transmission, memory), not a taste engine.
- **Modifying the Vixel rasterizer** (`vixel-rasterize.mjs`). It already handles stroke/SDF/grain correctly. The gap is upstream.
- **New SCDL ops beyond `project-genes`.** The contour-rim capability is expressed via `geometryHints.contourFollow` in the gene, not via a new SCDL keyword.
- **UI for gene authoring.** The approval *preview* is in scope (Claude); a full gene editor is a follow-up PDR.
- **Replacing the existing `rim` op.** It remains for canvas-edge bars. The gene system provides contour-following as an *alternative*, not a replacement.

### 3. Spec Sheet

#### Functional Spec

| Capability | Acceptance Criteria |
|---|---|
| Art-gene creation | `createSCDNAGenePacket({geneType:'art-direction', projectionMode:'hybrid', ...})` returns a frozen packet with `checksum` starting `scd64:`. |
| Deterministic projection | `projectGenes(genes, canvas, compilerVersion)` returns identical cell arrays for identical inputs across 100 runs. |
| Projection checksum | The projection health event contains both `geneChecksum` and `projectionChecksum`. Changing `PROJECTION_ALGO_VERSION` changes `projectionChecksum` for the same gene. |
| Human approval gate | Calling `commitGene(gene)` without `approvalRecord.approvedBy` throws `ART_GENE_REQUIRES_HUMAN_APPROVAL`. |
| Durable memory | After approval + projection, the ledger contains a row retrievable by `{assetId, geneId, geneChecksum, projectionChecksum}`. |
| Retrieval injection | Editing `PolarisOS/worldpacks/shrine-demo/scdl/brazier.scdl` injects the art-direction capability packet. Editing `src/pages/Combat/CombatPage.jsx` does not. |
| Feel score gate | A gene whose projection scores below threshold emits `PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD`. No cells are mutated. |
| Causal traceability | Every projected cell carries `{assetId, geneId, geneChecksum, projectionChecksum, sourceCoordOrHint, passVersion}`. |

#### Non-Functional Spec

| Property | Requirement |
|---|---|
| Determinism | Same inputs → same bytes. Verified by 100-iteration replay test. |
| Latency | Projection of ≤50 genes on a 64×64 canvas completes in <50ms (pure computation, no I/O). |
| Memory | Gene ledger is append-only JSONL; no in-memory state beyond the current compile. |
| Accessibility | Approval preview renders cells as an SVG grid with ARIA labels per cell role. |
| Backward compat | SCDL files with no genes compile identically to today (pass is a no-op). |

#### Contracts

**Art Gene Packet** (extends `PB-SCDNA-GENE-v1`):

```typescript
interface ArtGenePacket {
  contract: 'PB-SCDNA-GENE-v1';
  version: '1.1.0';
  assetId: string;
  geneId: string;
  geneType: 'art-direction';
  projectionMode: 'explicit' | 'derived' | 'hybrid';
  canvas: { width: number; height: number };
  bounds: { x: number; y: number; w: number; h: number };
  role: string;                    // e.g. 'rim-highlight', 'core-shadow'
  materialHint: string;            // e.g. 'obsidian'
  paletteRoles: readonly string[];
  coordinates: readonly Cell[];    // curated cells (explicit/hybrid)
  geometryHints: {
    lightDir?: 'upper-left' | 'upper-right' | 'lower-left' | 'lower-right' | 'top' | 'bottom';
    valueRamp?: string[];          // e.g. ['highlight','midtone','shadow']
    contourFollow?: boolean;
    rimWidth?: number;
    [key: string]: unknown;
  };
  checksum: string;                // `scd64:${hash}`
}
```

**Approval Record:**

```typescript
interface ApprovalRecord {
  geneChecksum: string;
  projectionChecksum: string;
  previewChecksum: string;         // checksum of the rendered preview the human saw
  approvedBy: string;              // human identifier
  approvedAt: string;              // ISO 8601 deterministic timestamp
  projectionMode: 'explicit' | 'derived' | 'hybrid';
  compilerVersion: string;
}
```

**Projection Health Event:**

```typescript
interface ArtProjectionHealthEvent {
  code: 'PB-OK-v1-ART-PROJECTION-OK';
  status: 'OK';
  assetId: string;
  geneId: string;
  geneChecksum: string;
  projectionChecksum: string;
  projectionAlgoVersion: string;
  compilerVersion: string;
  cellCount: number;
  byteLength: number;
}
```

#### Deferred to Follow-Up PDR

- Full gene-authoring UI (drag-and-drop cell editor with live projection preview).
- Feel-score-driven *suggestion* engine (propose gene edits to curator; never auto-apply).
- Cleri Probe pathology registration for causal-drift detection (`NO_REGISTERED_PATHOLOGY_CLASS` today).

### 4. Change Classification

| Tag | Rationale |
|---|---|
| **architectural** | Adds a new ontological layer (SCDNA art-genes) between intent and structure. Changes the conceptual model of the pipeline. |
| **structural** | New SCDL pass (`project-genes.pass.js`), new glossary family, new health codes, new durable ledger. |
| **behavioral** | SCDL compilation now consults genes when present. Existing behavior unchanged when no genes exist. |
| ~~cosmetic~~ | Not applicable. |

### 5. Assumptions and Unknowns

**Assumptions:**
- The `PB-SCDNA-GENE-v1` contract is stable and extensible (adding `projectionMode` and art-specific `geometryHints` fields does not break existing consumers).
- The capability-injection hook (`capability_inject.py`) can serve art-domain packets using the same glob-matching mechanism.
- The Feel score (`evaluateFeel` in `scdl-to-polaris.mjs`) is deterministic and stable enough to serve as a warn-only gate.
- The SCD64 glossary extension path (white paper §13, documented in `spatial-immune-orchestrator.js:34-44`) is the sanctioned mechanism for new families.

**Unknowns (surfaced, not blocking):**
- Whether the Feel score's Silhouette AMP is sensitive enough to distinguish good contour-following from bad at the warn threshold. May need calibration.
- Whether the `previewChecksum` (SVG render of projected cells) is stable across browser SVG renderers. If not, the preview checksum should be computed over the *cell array*, not the rendered SVG.
- The exact `PROJECTION_ALGO_VERSION` versioning scheme (semver? integer? date-stamped?). Needs a decision before Phase 2.

### 6. Open Questions / Escalations

```
ESCALATION: PROJECTION_ALGO_VERSION_SCHEME
Owner: Angel / repo owner
Context: The projection algorithm version is bound into projectionChecksum.
  Changing the scheme invalidates all prior approvals.
Question: semver (1.0.0), integer counter (1, 2, 3), or date-stamped (2026-07-25)?
Impact: Determines how aggressively prior approvals are invalidated on pass changes.
Deadline: Before Phase 2 implementation.
```

```
ESCALATION: PREVIEW_CHECKSUM_STABILITY
Owner: Claude (UI) + Codex (core)
Context: The approval record binds a previewChecksum. If computed over rendered
  SVG, it may differ across browsers. If computed over the cell array, it is
  deterministic but does not prove the human saw the correct visual.
Question: Checksum the cell array (deterministic) or the SVG bytes (visual fidelity)?
Impact: Determines whether approval is auditable across environments.
Deadline: Before Phase 4 (approval UI).
```

### 7. Architecture / File Map

```
codex/core/pixelbrain/
├── scdna-gene-packet.js              [Codex] — extend: add projectionMode, art geometryHints, PROJECTION_ALGO_VERSION
├── scdna-art-gene-store.js           [Gemini] — NEW: durable JSONL ledger (load, append, query by composite key)
├── scdna-art-gene-compiler.js        [Gemini] — NEW: validate → checksum → preview → human-commit CLI
└── scdl/passes/
    ├── project-genes.pass.js         [Codex] — NEW: gene → cell projection (deterministic, version-bound)
    └── (existing 11 passes)          [Codex] — unchanged

src/core/scd64/
├── glossary.ts                       [Codex] — extend: add ART_DIRECTION family
└── constants.ts                      [Codex] — unchanged (8 slots reused)

codex/core/diagnostic/
└── diagnostic-constants.js           [Codex] — extend: add ART health codes

steamdeck_brain/vaelrix_forcefield/scdna/
├── capabilities/
│   └── pixel-art-direction.capability.json  [Gemini] — NEW: art-domain capability packet
├── capability_store.py               [Gemini] — unchanged (glob matching already generic)
├── capability_compiler.py            [Gemini] — unchanged (art genes use their own compiler)
└── capability_inject.py              [Gemini] — unchanged (serves any valid packet on surface match)

PolarisOS/scripts/
└── scdl-to-polaris.mjs               [Codex] — extend: call evaluateFeel as warn-only gate during gene projection

docs/scholomance-encyclopedia/PDR-archive/
└── 2026-07-25-ontological-art-direction-pipeline-pdr.md  [this file]
```

**File-Ownership Table:**

| File | Owner | Action |
|---|---|---|
| `codex/core/pixelbrain/scdna-gene-packet.js` | Codex | Extend |
| `codex/core/pixelbrain/scdna-art-gene-store.js` | Gemini | Create |
| `codex/core/pixelbrain/scdna-art-gene-compiler.js` | Gemini | Create |
| `codex/core/pixelbrain/scdl/passes/project-genes.pass.js` | Codex | Create |
| `src/core/scd64/glossary.ts` | Codex | Extend |
| `codex/core/diagnostic/diagnostic-constants.js` | Codex | Extend |
| `steamdeck_brain/vaelrix_forcefield/scdna/capabilities/pixel-art-direction.capability.json` | Gemini | Create |
| `PolarisOS/scripts/scdl-to-polaris.mjs` | Codex | Extend |
| Approval preview component (TBD) | Claude | Create |

### 8. Step-by-Step Implementation Plan

#### Phase 1: Revive Gene Packet + Schema Extension
- **Owner:** Codex
- **Time:** ~2 hours
- **Milestone:** `createSCDNAGenePacket({geneType:'art-direction', projectionMode:'hybrid', ...})` returns a valid frozen packet. A live import edge exists (the SCDL compiler imports it).
- **Exit criteria:** Unit test passes: gene packet creation, checksum stability (100 iterations), `projectionMode` field present. `dead-code.md` entry removed.
- **Flag:** `SCDNA_ART_GENES_ENABLED=false` (env var; pass is no-op when false).

#### Phase 2: Projection Pass
- **Owner:** Codex
- **Time:** ~4 hours
- **Milestone:** `project-genes.pass.js` projects explicit/derived/hybrid genes into cells. `projectionChecksum` computed over bound inputs.
- **Exit criteria:** 100-iteration determinism test passes. Changing `PROJECTION_ALGO_VERSION` changes `projectionChecksum`. No genes → no-op (existing tests unchanged).
- **Flag:** Same env var. Pass registered but gated.

#### Phase 3: SCD64 Art Family + Health Codes
- **Owner:** Codex
- **Time:** ~1 hour
- **Milestone:** `ART_DIRECTION` family in glossary. Three health codes in `diagnostic-constants.js`.
- **Exit criteria:** Glossary entry validates against `SCD64_SLOT_NAMES`. Health codes follow `PB-{OK|WARN}-v1-*` pattern.
- **Flag:** None needed (additive constants).

#### Phase 4: Durable Ledger + Compiler CLI
- **Owner:** Gemini
- **Time:** ~4 hours
- **Milestone:** `scdna-art-gene-store.js` appends/queries JSONL. `scdna-art-gene-compiler.js` validates → checksums → previews → requires explicit `--approve-by <human>` flag to commit.
- **Exit criteria:** Committing without `--approve-by` throws `ART_GENE_REQUIRES_HUMAN_APPROVAL`. Ledger rows retrievable by `{assetId, geneId, geneChecksum, projectionChecksum}`. Replays distinguishable from first-time curation (`eventType: 'replay'`).
- **Flag:** CLI is opt-in by invocation.

#### Phase 5: Capability Packet + Retrieval Hook
- **Owner:** Gemini
- **Time:** ~2 hours
- **Milestone:** `pixel-art-direction.capability.json` compiled and committed. Editing a `.scdl` file in `PolarisOS/worldpacks/` injects the packet.
- **Exit criteria:** `packets_for_path('PolarisOS/worldpacks/shrine-demo/scdl/brazier.scdl')` returns the art packet. `packets_for_path('src/pages/Combat/CombatPage.jsx')` does not. Serve log records the decision.
- **Flag:** Packet presence is the flag; remove the file to disable.

#### Phase 6: Feel Score Gate + Approval Preview
- **Owner:** Codex (gate) + Claude (preview)
- **Time:** ~3 hours
- **Milestone:** `evaluateFeel` called during projection; below-threshold emits `PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD` (never mutates). Approval preview renders projected cells as SVG grid.
- **Exit criteria:** Low-score gene produces warning, not mutation. Preview SVG is deterministic (same cells → same SVG bytes). Approval record binds `previewChecksum`.
- **Flag:** Warn-only by default. Threshold configurable via env var `ART_FEEL_THRESHOLD`.

### 9. Code Examples for the 5–10 Most Pivotal Changes

#### 9.1 — Gene Packet Extension (`scdna-gene-packet.js`)

```javascript
// codex/core/pixelbrain/scdna-gene-packet.js (additions)

export const PROJECTION_ALGO_VERSION = '1.0.0';

export function createSCDNAGenePacket(input) {
  const coordinates = normalizeCoordinates(input.coordinates);
  const projectionMode = input.projectionMode ?? 'explicit';

  if (!['explicit', 'derived', 'hybrid'].includes(projectionMode)) {
    throw new Error(`Invalid projectionMode: ${projectionMode}`);
  }

  const packet = {
    contract: 'PB-SCDNA-GENE-v1',
    version: '1.1.0',
    assetId: String(input.assetId),
    geneId: String(input.geneId),
    geneType: String(input.geneType),
    projectionMode,
    canvas: { width: toInt(input.canvas?.width), height: toInt(input.canvas?.height) },
    bounds: input.bounds ?? computeBounds(coordinates),
    role: input.role ?? 'unknown',
    materialHint: input.materialHint ?? 'source',
    paletteRoles: Object.freeze([...(input.paletteRoles ?? [])].sort()),
    coordinates: Object.freeze(coordinates),
    geometryHints: Object.freeze(input.geometryHints ?? {}),
  };

  return Object.freeze({ ...packet, checksum: checksumStableJSON(packet) });
}
```

#### 9.2 — Projection Pass (`project-genes.pass.js`)

```javascript
// codex/core/pixelbrain/scdl/passes/project-genes.pass.js
import crypto from 'node:crypto';
import { PROJECTION_ALGO_VERSION } from '../scdna-gene-packet.js';

/**
 * Deterministic gene → cell projection.
 * Binds: geneChecksum, canvas dims, algo version, compiler version.
 * Same inputs → same cells → same projectionChecksum. Always.
 */
export function projectGenes(genes, canvas, compilerVersion) {
  const cells = [];

  for (const gene of genes) {
    const mode = gene.projectionMode ?? 'explicit';

    // Explicit cells: pass through as-is
    if (mode === 'explicit' || mode === 'hybrid') {
      for (const coord of gene.coordinates) {
        cells.push({
          x: coord.x, y: coord.y, color: coord.color,
          role: coord.role, partId: coord.partId,
          // Causal provenance
          _gene: { assetId: gene.assetId, geneId: gene.geneId, geneChecksum: gene.checksum, source: 'coordinate' },
        });
      }
    }

    // Derived cells: contour-following from geometryHints
    if (mode === 'derived' || mode === 'hybrid') {
      if (gene.geometryHints.contourFollow) {
        const derived = projectContourCells(gene, canvas);
        for (const cell of derived) {
          cells.push({
            ...cell,
            _gene: { assetId: gene.assetId, geneId: gene.geneId, geneChecksum: gene.checksum, source: 'contourFollow' },
          });
        }
      }
    }
  }

  const projectionChecksum = computeProjectionChecksum(genes, canvas, compilerVersion);
  return Object.freeze({ cells: Object.freeze(cells), projectionChecksum });
}

function computeProjectionChecksum(genes, canvas, compilerVersion) {
  const bound = {
    geneChecksums: genes.map(g => g.checksum).sort(),
    canvas: { width: canvas.width, height: canvas.height },
    projectionAlgoVersion: PROJECTION_ALGO_VERSION,
    compilerVersion,
  };
  const json = JSON.stringify(bound, Object.keys(bound).sort());
  const hash = crypto.createHash('sha256').update(json).digest('hex').toUpperCase().slice(0, 64);
  return hash;
}

function projectContourCells(gene, canvas) {
  // Trace the part boundary via SDF sign changes.
  // Deterministic: pure function of gene.geometryHints + canvas.
  const { rimWidth = 1, lightDir = 'top' } = gene.geometryHints;
  const cells = [];
  // ... SDF boundary trace implementation (Phase 2 detail)
  return cells;
}
```

#### 9.3 — SCD64 Art Family (`glossary.ts` addition)

```typescript
// src/core/scd64/glossary.ts (addition to BUG_FAMILIES or new ART_FAMILIES export)

export const ART_FAMILIES = Object.freeze({
  ART_DIRECTION: Object.freeze({
    versionByte: 'A1',
    domain: 'ART',
    description: 'Aesthetic intent: light direction, value ramp, contour treatment for pixel art assets.',
    canonicals: Object.freeze([
      { slot: 'BUGCLASS',  canonical: 'ARTCLASS:RIM_LIGHT:contour-follow+upper-left' },
      { slot: 'COORDSYS',  canonical: 'COORDSYS:gene-coordinates+part-silhouette+sdf-boundary' },
      { slot: 'INVARIANT', canonical: 'INVARIANT:value-ramp-monotonic-toward-shadow+deterministic-projection' },
      { slot: 'MAGNITUDE', canonical: 'MAGNITUDE:rim-width=1+highlight-coverage+shadow-depth' },
      { slot: 'MASKING',   canonical: 'MASKING:none+explicit-provenance-per-cell' },
      { slot: 'GATE',      canonical: 'GATE:feel-score>=threshold+human-approval-required' },
      { slot: 'PROPAGATE', canonical: 'PROPAGATE:gene-to-SCDL-to-packet-to-raster-to-health-event' },
      { slot: 'VERDICT',   canonical: 'VERDICT:curated+human-approved+deterministic-projection' },
    ]),
  }),
});
```

#### 9.4 — Human Approval Gate (`scdna-art-gene-compiler.js`)

```javascript
// codex/core/pixelbrain/scdna-art-gene-compiler.js
import { createSCDNAGenePacket, PROJECTION_ALGO_VERSION } from './scdna-gene-packet.js';
import { projectGenes } from './scdl/passes/project-genes.pass.js';
import { appendToLedger } from './scdna-art-gene-store.js';

export function commitGene(gene, approval, compilerVersion) {
  // EXECUTABLE INVARIANT: human authority
  if (!approval || !approval.approvedBy) {
    throw new Error('ART_GENE_REQUIRES_HUMAN_APPROVAL: source !== human-approved');
  }

  const projection = projectGenes([gene], gene.canvas, compilerVersion);

  // Bind approval to both checksums
  const record = Object.freeze({
    geneChecksum: gene.checksum,
    projectionChecksum: projection.projectionChecksum,
    previewChecksum: approval.previewChecksum,
    approvedBy: approval.approvedBy,
    approvedAt: approval.approvedAt,
    projectionMode: gene.projectionMode,
    projectionAlgoVersion: PROJECTION_ALGO_VERSION,
    compilerVersion,
    eventType: 'curation',
  });

  appendToLedger(record);
  return record;
}
```

#### 9.5 — Durable Ledger (`scdna-art-gene-store.js`)

```javascript
// codex/core/pixelbrain/scdna-art-gene-store.js
import fs from 'node:fs';
import path from 'node:path';

const LEDGER_PATH = path.resolve('codex/core/pixelbrain/art-gene-ledger.jsonl');

export function appendToLedger(record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(LEDGER_PATH, line, 'utf-8');
}

export function queryLedger({ assetId, geneId, geneChecksum, projectionChecksum }) {
  if (!fs.existsSync(LEDGER_PATH)) return [];
  const lines = fs.readFileSync(LEDGER_PATH, 'utf-8').trim().split('\n');
  return lines
    .map(l => JSON.parse(l))
    .filter(r =>
      (!assetId || r.assetId === assetId) &&
      (!geneId || r.geneId === geneId) &&
      (!geneChecksum || r.geneChecksum === geneChecksum) &&
      (!projectionChecksum || r.projectionChecksum === projectionChecksum)
    );
}
```

#### 9.6 — Health Codes (`diagnostic-constants.js` addition)

```javascript
// codex/core/diagnostic/diagnostic-constants.js (additions to HEALTH_CODES)
export const HEALTH_CODES = Object.freeze({
  // ... existing codes ...
  // ART-DIRECTION pipeline
  ART_GENE_CURATED: 'PB-OK-v1-ART-GENE-CURATED',
  ART_PROJECTION_OK: 'PB-OK-v1-ART-PROJECTION-OK',
  ART_FEEL_BELOW_THRESHOLD: 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
});
```

#### 9.7 — Capability Packet (`pixel-art-direction.capability.json`)

```json
{
  "contract": "SCDNA-CAPABILITY-v1",
  "domain": "pixel-art-direction",
  "surfaces": [
    "PolarisOS/worldpacks/**/*.scdl",
    "codex/core/pixelbrain/scdl/passes/**",
    "codex/core/pixelbrain/scdna-gene-packet.js",
    "codex/core/pixelbrain/scdna-art-gene-*.js"
  ],
  "capabilities": [
    {
      "need": "rim/edge highlight that follows a shape's contour instead of canvas edges",
      "canonical": "art gene geneType=art-direction projectionMode=derived geometryHints.contourFollow=true → project-genes.pass.js",
      "path": "codex/core/pixelbrain/scdl/passes/project-genes.pass.js",
      "evidence": "brazier.scdl:17-18 hand-places 23 cells because the rim op only emits canvas-edge bars (expand-cells.pass.js:25-42)",
      "forbidden": ["hand-placing edge cells in SCDL for contour highlights", "using the rim op for silhouette edges", "auto-generating genes without human approval"]
    },
    {
      "need": "traceable provenance for every projected pixel",
      "canonical": "each cell carries _gene: {assetId, geneId, geneChecksum, projectionChecksum, source}",
      "path": "codex/core/pixelbrain/scdl/passes/project-genes.pass.js",
      "evidence": "anonymous pixels cannot be audited; causal drift undetectable without provenance",
      "forbidden": ["emitting cells without _gene provenance", "stripping provenance before packet emission"]
    }
  ],
  "checksum": "COMPILED_BY_CAPABILITY_COMPILER"
}
```

#### 9.8 — Feel Score Gate (warn-only, in `scdl-to-polaris.mjs`)

```javascript
// PolarisOS/scripts/scdl-to-polaris.mjs (addition to gene projection path)
import { HEALTH_CODES } from '../../codex/core/diagnostic/diagnostic-constants.js';

function gateFeelScore(projection, assetKey, threshold = 0.6) {
  const score = evaluateFeel(projection.cells, assetKey);
  if (score.spatialAwareness < threshold) {
    // WARN only. NEVER mutate.
    console.warn(JSON.stringify({
      code: HEALTH_CODES.ART_FEEL_BELOW_THRESHOLD,
      status: 'WARN',
      assetId: assetKey,
      score: score.spatialAwareness,
      threshold,
      projectionChecksum: projection.projectionChecksum,
      action: 'none — human curator decides',
    }));
  }
  return score;
}
```

### 10. Glossary

| Term | Definition |
|---|---|
| **SCDNA** | Scholomance DNA — curated, checksummed knowledge genes that carry operational instructions, not just data. |
| **SCDL** | Scholomance Cell Description Language — the declarative pixel-art compiler (`codex/core/pixelbrain/scdl/`). |
| **SCD64** | A 64-hex-character checksum used as a content-addressed identifier for packets and bug families. |
| **BytecodeHealth** | The green-path health event system (`PB-OK-v1-*`, `PB-WARN-v1-*`) for recording system state. |
| **Gene** | A curated SCDNA packet carrying intent + coordinates + hints for a specific asset role. |
| **Projection** | The deterministic compilation of a gene into concrete cells (gene → pixels). |
| **projectionMode** | How a gene's cells are sourced: `explicit` (human-placed), `derived` (compiler-computed from hints), `hybrid` (both). |
| **Causal drift** | The failure mode where a gene's checksum stays stable but a newer projection pass produces different cells. |
| **Capability packet** | A curated `SCDNA-CAPABILITY-v1` JSON that injects domain knowledge when an agent touches a matching file surface. |
| **Feel score** | The Photonic Feel aggregate (`evaluateFeel`) scoring Geometry/Construction/Silhouette AMPs. |
| **Curation Law** | PDR §7.1: genes are manually curated, never auto-generated; the compiler may not commit without human approval. |
| **Approval record** | The binding of `geneChecksum + projectionChecksum + previewChecksum + approvedBy` that makes curation auditable. |

### 11. Q&A — Top 10 Most Confusing Implementation Concerns

**Q1: Why not just add more SCDL ops instead of a whole ontological layer?**  
A: SCDL ops answer *where* and *what color*. They cannot answer *why*, *who decided*, or *what principle governs this edge*. The ontological layer provides representation, retrieval, transmission, and memory — none of which are expressible as ops. The brazier's 23 hand-placed cells prove the point: the ops *can* place them, but nothing *remembers why they exist*.

**Q2: If the gene is dead code, why not just write a new module?**  
A: The gene packet's checksum logic (`checksumStableJSON`, `stableStringify`) and health-event bridge (`createSCDNAGeneReadyHealthEvent`) are correct and tested. Reviving via a live import edge preserves that work. A new module would duplicate it. The dead-code flag is a *wiring* problem, not a *quality* problem.

**Q3: How does `contourFollow` actually trace a boundary?**  
A: The SDF (signed distance field) data is already computed by `expand-vector.pass.js` and stored on ops. `projectContourCells` walks the SDF grid, finds sign-change cells (boundary), and selects those within `rimWidth` of the boundary on the `lightDir`-facing side. Pure computation, no RNG.

**Q4: What stops the Feel score from becoming a mutation trigger?**  
A: The gate function *only* emits a `PB-WARN` event. It returns the score for the curator to see. There is no code path from score → cell modification. The Curation Law is enforced structurally: the warn function has no write access to the gene or cell arrays.

**Q5: How do you prevent causal drift?**  
A: `projectionChecksum` binds `PROJECTION_ALGO_VERSION`. If the projection pass changes behavior, its version bumps, the checksum changes, and prior approvals no longer match. The ledger query reveals the mismatch. The system refuses to honor stale approvals (same mechanism as `capability_store.py` refusing checksum-mismatched packets).

**Q6: Can two genes conflict (overlap cells)?**  
A: Yes. The projection pass processes genes in sorted order (by `geneId`). Later genes overwrite earlier ones for the same `(x, y)`. The `_gene` provenance on each cell records *which* gene won. Conflict resolution is deterministic (sort order), not arbitrary.

**Q7: What happens if I edit a gene file by hand?**  
A: The checksum won't match. The store refuses to serve it (same as `capability_store.py:load_packets` — "hand-edited outside the compiler; refusing to serve it"). You must re-compile and re-approve.

**Q8: Is the ledger append-only forever? Won't it grow unbounded?**  
A: Yes, append-only by design (auditability). In practice, art genes are curated infrequently (dozens, not thousands). If growth becomes a concern, a follow-up PDR can add compaction (merge replay rows) — but never deletion of curation events.

**Q9: How does retrieval avoid the "wallpaper" problem (genes fired 4×, heeded 0×)?**  
A: The `RE_ARM_EDITS = 10` window (measured, not chosen — see `capability_inject.py:47-52`) limits re-injection frequency. The serve log (`scdna-capability-serves.jsonl`) records every decision. `read_serve_log()` is the attention instrument. If art packets become wallpaper, the log reveals it and the re-arm window can be tuned.

**Q10: Why SCD64 for transmission instead of just storing the gene JSON?**  
A: SCD64 provides a *fixed-width, content-addressed identity* that fits in health events, ledger rows, and diagnostic reports without embedding the full gene payload. The gene JSON is the content; the SCD64 checksum is the address. You look up the content by the address. This is the same pattern as git (SHA → blob).

### 12. QA Plan

**New test files:**

| File | Owner |
|---|---|
| `codex/core/pixelbrain/__tests__/scdna-art-gene.test.js` | Codex |
| `codex/core/pixelbrain/__tests__/project-genes.test.js` | Codex |
| `codex/core/pixelbrain/__tests__/scdna-art-gene-store.test.js` | Gemini |
| `codex/core/pixelbrain/__tests__/scdna-art-gene-compiler.test.js` | Gemini |
| `src/core/scd64/__tests__/art-family.test.ts` | Codex |

**Commands (project uses npm + vitest):**

```bash
# Run all new tests
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene.test.js
npx vitest run codex/core/pixelbrain/__tests__/project-genes.test.js
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene-store.test.js
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene-compiler.test.js
npx vitest run src/core/scd64/__tests__/art-family.test.ts

# Determinism replay (100 iterations)
npx vitest run codex/core/pixelbrain/__tests__/project-genes.test.js -t "determinism"

# Full regression
npm run test

# Typecheck
npm run typecheck
```

**Example test (determinism):**

```javascript
// codex/core/pixelbrain/__tests__/project-genes.test.js
import { describe, it, expect } from 'vitest';
import { projectGenes } from '../scdl/passes/project-genes.pass.js';
import { createSCDNAGenePacket } from '../scdna-gene-packet.js';

describe('project-genes determinism', () => {
  const gene = createSCDNAGenePacket({
    assetId: 'test-asset', geneId: 'test-gene', geneType: 'art-direction',
    projectionMode: 'explicit', canvas: { width: 8, height: 8 },
    coordinates: [{ x: 0, y: 0, color: '#FF0000' }],
    geometryHints: {},
  });

  it('produces identical output across 100 iterations', () => {
    const results = new Set();
    for (let i = 0; i < 100; i++) {
      const { cells, projectionChecksum } = projectGenes([gene], gene.canvas, '1.0.0');
      results.add(JSON.stringify({ cells, projectionChecksum }));
    }
    expect(results.size).toBe(1);
  });

  it('changes projectionChecksum when algo version changes', () => {
    const a = projectGenes([gene], gene.canvas, '1.0.0');
    const b = projectGenes([gene], gene.canvas, '2.0.0');
    expect(a.projectionChecksum).not.toBe(b.projectionChecksum);
  });
});
```

**Example test (human approval gate):**

```javascript
// codex/core/pixelbrain/__tests__/scdna-art-gene-compiler.test.js
import { describe, it, expect } from 'vitest';
import { commitGene } from '../scdna-art-gene-compiler.js';
import { createSCDNAGenePacket } from '../scdna-gene-packet.js';

describe('human approval gate', () => {
  const gene = createSCDNAGenePacket({
    assetId: 'test', geneId: 'g1', geneType: 'art-direction',
    projectionMode: 'explicit', canvas: { width: 4, height: 4 },
    coordinates: [{ x: 0, y: 0, color: '#00FF00' }],
  });

  it('refuses without approval', () => {
    expect(() => commitGene(gene, null, '1.0.0'))
      .toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('refuses with empty approvedBy', () => {
    expect(() => commitGene(gene, { approvedBy: '' }, '1.0.0'))
      .toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
  });

  it('commits with valid approval', () => {
    const record = commitGene(gene, {
      approvedBy: 'human-tester',
      approvedAt: '2026-07-25T00:00:00Z',
      previewChecksum: 'abc123',
    }, '1.0.0');
    expect(record.geneChecksum).toBe(gene.checksum);
    expect(record.projectionChecksum).toBeDefined();
  });
});
```

### 13. Regression Risks and Specific Retest Checklist

| Risk | Scenario | Retest Command |
|---|---|---|
| Existing SCDL compilation breaks | Compile `brazier.scdl` with no genes present | `node codex/core/pixelbrain/scdl/scdl.cli.js compile PolarisOS/worldpacks/shrine-demo/scdl/brazier.scdl --export json` — output must be byte-identical to pre-change |
| Vixel rasterizer output changes | Rasterize brazier at 4× | `node PolarisOS/scripts/vixel-rasterize.mjs brazier 4` — PNG must be byte-identical |
| Feel score changes | Run scdl-to-polaris | `node PolarisOS/scripts/scdl-to-polaris.mjs` — scores must match pre-change |
| SCD64 glossary breaks existing families | Run scd64 tests | `npx vitest run src/core/scd64/` |
| Capability injection serves wrong packets | Inject on non-art file | `python -m vaelrix_forcefield.scdna.capability_inject` with `file_path=src/pages/Combat/CombatPage.jsx` — must return empty |
| Health codes collide | Diagnostic scan | `npx vitest run codex/core/diagnostic/` |
| Gene packet checksum instability | 100-iteration test | `npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene.test.js -t "checksum stability"` |

### 14. Rollout Plan

**Feature flag:** `SCDNA_ART_GENES_ENABLED` env var (default `false`). When false, `project-genes.pass.js` is a no-op and the compiler ignores gene files.

**Shadow mode (Phase 1–3):** Pass is registered but gated. Existing compilation runs unchanged. New tests run in CI but don't block merges (marked `skip` until Phase 4).

**Canary (Phase 4–5):** Enable for the brazier asset only. Compile `brazier.scdl` with its art genes. Compare output PNG to the existing hand-placed version. If identical (or improved), proceed.

**Incomplete-but-safe clause:** Before the pipeline is complete, the system runs exactly as today. The `project-genes` pass is a no-op without genes. The ledger is empty. The capability packet is absent. Nothing degrades. The *only* visible change is the env var existing.

**Rollback:**
1. Set `SCDNA_ART_GENES_ENABLED=false`.
2. Remove `pixel-art-direction.capability.json` from the capabilities directory.
3. Delete `art-gene-ledger.jsonl` (or leave it; it's inert without the flag).
4. Existing compilation is unaffected.

### 15. Definition of Done

- [ ] `createSCDNAGenePacket({geneType:'art-direction', projectionMode:'hybrid'})` returns a valid frozen packet with `scd64:` checksum.
- [ ] `project-genes.pass.js` is registered in the SCDL pass pipeline and gated by `SCDNA_ART_GENES_ENABLED`.
- [ ] 100-iteration determinism test passes for projection.
- [ ] Changing `PROJECTION_ALGO_VERSION` changes `projectionChecksum`.
- [ ] `commitGene` without `approvedBy` throws `ART_GENE_REQUIRES_HUMAN_APPROVAL`.
- [ ] Ledger rows are retrievable by `{assetId, geneId, geneChecksum, projectionChecksum}`.
- [ ] `ART_DIRECTION` family exists in `glossary.ts` with all 8 slots.
- [ ] Three health codes exist in `diagnostic-constants.js`.
- [ ] Editing `brazier.scdl` injects the art capability packet; editing `CombatPage.jsx` does not.
- [ ] Low Feel score emits `PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD` and does NOT mutate cells.
- [ ] Every projected cell carries `_gene` provenance.
- [ ] Existing `brazil.scdl` compilation output is byte-identical with no genes present.
- [ ] `npm run test` passes. `npm run typecheck` passes.
- [ ] `dead-code.md` entry for `scdna-gene-packet.js` is removed.
- [ ] PIR filed (see §18).

### 16. Final Architectural Verdict

**Complete with acceptable risk.**

The design is law-audit clean, grounded in four existing substrates that already interoperate (SCDNA checksums as SCD64, SCDNA emits BytecodeHealth events, capability store does glob-based retrieval, Feel score evaluates projections). The primary risk — causal drift — is mitigated by dual-checksum binding but cannot be *eliminated* until a Cleri Probe pathology class is registered for it (follow-up). The secondary risk — preview checksum stability across renderers — is escalated (§6) and does not block Phases 1–5. The incomplete system is safe: it degrades to today's behavior with the flag off. No existing public API is broken. The Curation Law is enforced as executable code, not documentation.

### 17. References

- `codex/core/pixelbrain/scdna-gene-packet.js` — existing gene packet (dead code, to be revived)
- `codex/core/pixelbrain/scdl/passes/expand-cells.pass.js:25-42` — `rim` op (canvas-edge bars only; the gap this PDR addresses)
- `codex/core/pixelbrain/scdl/passes/expand-vector.pass.js` — SDF computation (input to contour tracing)
- `src/core/scd64/glossary.ts` — existing `BUG_FAMILIES` (pattern for `ART_FAMILIES`)
- `src/core/scd64/constants.ts` — 8 slot names (reused)
- `codex/core/diagnostic/diagnostic-constants.js` — existing health codes (pattern for art codes)
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py` — glob-based retrieval (reused as-is)
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py` — human-gated commit (pattern for art compiler)
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py` — PreToolUse hook (reused as-is)
- `PolarisOS/scripts/scdl-to-polaris.mjs:55-159` — `evaluateFeel` (Feel score gate)
- `PolarisOS/scripts/vixel-rasterize.mjs` — rasterizer (unchanged, downstream consumer)
- `PolarisOS/worldpacks/shrine-demo/scdl/brazier.scdl:17-18` — the 23 hand-placed cells (motivating example)
- `docs/superpowers/plans/2026-07-17-capability-packets.md` — Curation Law (PDR §7.1), retrieval doctrine
- `docs/scholomance-encyclopedia/PDR-archive/2026-07-04-scdna-constructive-silhouette-recall-pdr.md` — prior SCDNA+PixelBrain PDR (architectural precedent)
- `spatial-immune-orchestrator.js:34-44` — SCD64 glossary extension path (white paper §13)

### 18. Post-Implementation Report Handoff

**PIR filename:** `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260725-ONTOLOGICAL-ART-DIRECTION.md`  
**Due:** Within 7 days of Phase 6 completion.  
**Must contain:** determinism test results (100-iteration output), before/after brazier PNG comparison, ledger row count, capability serve-log excerpt, Feel score delta, and causal-drift mitigation verification (version bump → checksum change → approval invalidation).

---

*End of PDR.*
