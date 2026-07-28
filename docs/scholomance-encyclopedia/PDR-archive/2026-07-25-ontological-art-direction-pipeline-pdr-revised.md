# PDR: Ontological Art-Direction Pipeline
## SCDNA → SCDL → SCD64 → BytecodeHealth

**Status:** Approved design, implementation-ready after preflight  
**Original date:** 2026-07-25  
**Revision date:** 2026-07-28  
**Version:** 2.0  
**Authors:** Human architectural direction + Mother initial synthesis  
**Revision scope:** Contract hardening, checksum correction, durable-memory clarification, deterministic conflict resolution, approval-authority binding, and QA repair  
**Archive target:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr.md`  
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-ONTOLOGICAL-ART-DIRECTION`

**Depends on:**

- `codex/core/pixelbrain/scdna-gene-packet.js`
- `codex/core/pixelbrain/scdl/passes/*`
- `src/core/scd64/glossary.ts`
- `src/core/scd64/constants.ts`
- `codex/core/diagnostic/diagnostic-constants.js`
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_store.py`
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_compiler.py`
- `steamdeck_brain/vaelrix_forcefield/scdna/capability_inject.py`
- `PolarisOS/scripts/scdl-to-polaris.mjs`
- `PolarisOS/scripts/vixel-rasterize.mjs`

---

## 0. Decision Record

The Vixel pipeline already has four compatible substrates:

1. **SCDNA genes** can represent curated, checksummed knowledge.
2. **SCDL** can deterministically express cell structure.
3. **SCD64** can provide fixed-width content addresses and glossary-backed interpretation.
4. **BytecodeHealth** can describe curation, projection, and warning events.

The missing work is not a new generator. It is a set of live dependency edges and deterministic adapters connecting those substrates into one causal pipeline.

The approved causal chain is:

```text
human-curated aesthetic intent
  ↓
PB-SCDNA-GENE-v1 art-direction gene
  ↓
project-genes.pass.js
  ↓
SCDL cell operations with causal provenance
  ↓
SCD64-addressed gene and projection identities
  ↓
BytecodeHealth event persisted to the art-memory ledger
  ↓
SCDNA capability retrieval on matching file surfaces
  ↓
future agents receive the curated art-direction mnemonic
```

The system may validate, project, checksum, preview, warn, retrieve, and replay. It may not silently author, approve, mutate, or commit aesthetic genes.

---

## 1. Owners

| Area | Owner | Responsibility |
|---|---|---|
| Gene packet and projection core | Qwen / DivTube core agent | Schema extension, projection algorithm, provenance, projection checksum |
| SCD64 glossary and diagnostic codes | Qwen / DivTube core agent | Art family, aliases, health constants |
| Durable ledger and compiler CLI | Assigned implementation agent | Append-only event store, validation, preview flow, human-gated commit |
| Approval preview | UI agent | Deterministic SVG document, accessible preview, explicit approval handoff |
| Capability retrieval | Forcefield agent | Art capability packet, surface registration, serve-log verification |
| Cross-domain escalation | Angel / repository owner | Version epochs, authority policy, conflicting architectural laws |

No file may be edited by an unassigned agent without an ownership transfer recorded in the task notes.

---

## 2. Context

The current Vixel asset pipeline can compile SCDL into exact pixels, but it cannot preserve why a pixel exists.

The shrine brazier demonstrates the gap. Its contour highlight is represented by hand-placed cells because the existing `rim` behavior describes canvas-edge bars rather than part-silhouette lighting. Those cells carry geometry, but no durable account of:

- the intended light direction,
- the material response,
- the value-ramp law,
- the contour-following rule,
- the curator who approved it,
- the projection algorithm that manifested it,
- or the prior decision an agent should retrieve when editing a similar asset.

This PDR converts those anonymous coordinates into a first-class causal artifact.

A projected cell must be able to answer:

```text
Why do I exist?
Which curated gene produced me?
Which projection law interpreted that gene?
Which preview did the human approve?
Which health event recorded the result?
When should an agent retrieve this knowledge again?
```

---

## 3. Goal

Close the intent-to-art gap by giving curated aesthetic intent:

1. **a representation** through SCDNA art-direction genes,
2. **a deterministic projection path** through SCDL,
3. **a transmission address** through SCD64 checksums,
4. **durable memory** through persisted BytecodeHealth events,
5. **a retrieval path** through SCDNA capability packets,
6. **a warn-only fitness signal** through `evaluateFeel`.

The result is not machine-created taste. It is machine-preserved taste.

---

## 4. Non-Goals

This PDR does not authorize:

- auto-generating art genes from prose,
- autonomous cell synthesis from aesthetic adjectives,
- automatic mutation in response to a Feel score,
- automatic approval or commit,
- replacing the existing `rim` operation,
- rewriting the Vixel rasterizer,
- a full visual gene editor,
- treating SCD64 hashes as semantic payloads,
- browser-pixel screenshots as deterministic approval evidence,
- or broad SCDL syntax expansion unrelated to gene projection.

A future system may suggest edits to a human curator, but no suggestion may modify an approved gene without a new preview and a new explicit approval record.

---

## 5. Existing Substrates

| Substrate | Existing artifact | Current role | Required change |
|---|---|---|---|
| Ontology | `PB-SCDNA-GENE-v1` | Frozen, checksummed gene packet | Revive through a live import edge; add art-direction schema |
| Retrieval | `SCDNA-CAPABILITY-v1` | Surface-matched mnemonic injection | Add pixel-art-direction capability packet |
| Transmission | SCD64 glossary + 8 wire slots | Fixed-width content addressing | Add ART domain family and domain-aware aliases |
| Health vocabulary | `PB-OK-v1-*`, `PB-WARN-v1-*` | Event contracts | Add art curation, projection, and Feel warning codes |
| Durable memory | New art-memory JSONL ledger | Not currently present for art genes | Persist validated health-event envelopes |
| Fitness | `evaluateFeel` | Geometry, Construction, Silhouette aggregate | Invoke after projection as warn-only evidence |

### 5.1 Load-bearing existing connections

- The gene packet already produces an SCD64-style checksum.
- The gene packet already has a bridge to BytecodeHealth event construction.
- Capability retrieval already operates from matching file surfaces rather than prompt vocabulary.
- Feel evaluation already exists downstream of SCDL compilation.

This is a connection job, not a greenfield ontology engine.

---

## 6. Core Invariants

### 6.1 Human authority

Only an explicit, interactive human-approval authority may commit an art gene.

A nonempty `approvedBy` string is not sufficient proof of human authority. The commit path must receive a validated authority record created by the interactive approval boundary.

```js
if (
  approval?.authority?.kind !== 'human' ||
  approval?.authority?.source !== 'interactive-human-gate' ||
  !approval?.authority?.actorId
) {
  throw new Error('ART_GENE_REQUIRES_HUMAN_APPROVAL');
}
```

The compiler may not fabricate this authority object.

### 6.2 Deterministic projection

The projection is a pure function of explicitly bound inputs:

```text
gene checksums
+ canvas dimensions
+ SDF inputs and their checksums
+ palette-role mapping version
+ projection algorithm epoch
+ compiler version
+ conflict policy version
= projection identity
```

No filesystem reads, timestamps, environment discovery, random values, or mutable global state are permitted inside the pure projection function.

### 6.3 Separate identities

The system must preserve three distinct identities:

| Identity | Meaning |
|---|---|
| `geneChecksum` | The curated semantic and geometric intent |
| `projectionChecksum` | The concrete cell manifestation under a specific transformation law |
| `previewDocumentChecksum` | The deterministic preview document the human reviewed |

The approval record binds all three.

### 6.4 Causal traceability

Every projected cell carries sufficient provenance to identify:

- asset,
- gene,
- gene checksum,
- projection checksum,
- projection epoch,
- source coordinate or source geometry hint,
- and conflict winner where overlap occurred.

### 6.5 Backward compatibility

When the feature flag is disabled, or when no applicable approved genes exist, the pass is a strict no-op. Existing SCDL and raster output must remain byte-identical.

### 6.6 SCD64 is an address

SCD64 carries the address or fingerprint. It does not carry the full art-direction payload.

```text
SCD64 checksum = key
SCDNA gene JSON = content
SCD64 glossary = domain interpretation contract
ledger/store = key-to-content and key-to-event lookup
```

### 6.7 BytecodeHealth becomes memory only through persistence

Emitting an event is not durable memory by itself.

An art health event becomes a memory cell only after it is:

1. schema-validated,
2. written to the append-only art-memory ledger,
3. indexed or queryable by its composite identity,
4. and retrievable in a later process.

---

## 7. Architecture

```text
┌────────────────────────────────────┐
│ Human-curated art decision         │
│ coordinates + geometry doctrine    │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ PB-SCDNA-GENE-v1                   │
│ geneChecksum                       │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ project-genes.pass.js              │
│ deterministic, pure core           │
│ projectionAlgoVersion              │
│ projectionChecksum                 │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ SCDL cell operations               │
│ per-cell causal provenance         │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ evaluateFeel                       │
│ structural warning only            │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Approval preview                   │
│ model checksum + SVG checksum      │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ Interactive human approval gate    │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ BytecodeHealth event envelope      │
│ append-only durable ledger         │
└──────────────────┬─────────────────┘
                   ↓
┌────────────────────────────────────┐
│ SCDNA capability retrieval         │
│ future agent receives mnemonic     │
└────────────────────────────────────┘
```

---

## 8. Contract Definitions

### 8.1 Projection algorithm version

Use a monotonic integer epoch:

```js
export const PROJECTION_ALGO_VERSION = 1;
```

Every output-affecting change increments this integer.

Package and compiler versions remain SemVer. The projection epoch is deliberately simpler because any output-affecting change invalidates previous projection approval, regardless of whether the code change would otherwise be called patch, minor, or major.

### 8.2 Art gene packet

```ts
interface ArtGenePacket {
  contract: 'PB-SCDNA-GENE-v1';
  version: '1.1.0';

  assetId: string;
  geneId: string;
  geneType: 'art-direction';

  /** Stable artistic layering control. */
  priority: number;

  projectionMode: 'explicit' | 'derived' | 'hybrid';

  canvas: {
    width: number;
    height: number;
  };

  /** Null when bounds are resolved from a named SDF part. */
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  } | null;

  role: string;
  materialHint: string;

  /** Set semantics. Canonically normalized and sorted. */
  paletteRoles: readonly string[];

  /** Ordered semantics. Never sorted. */
  coordinates: readonly ArtGeneCoordinate[];

  geometryHints: {
    lightDir?:
      | 'upper-left'
      | 'upper-right'
      | 'lower-left'
      | 'lower-right'
      | 'top'
      | 'bottom';

    valueRamp?: readonly string[];
    contourFollow?: boolean;
    contourPartId?: string;
    rimWidth?: number;
    occlusionPolicy?: 'respect-silhouette' | 'ignore-occlusion';
    cornerPolicy?: 'preserve' | 'bevel' | 'round';

    /** Non-operational namespaced metadata. */
    extensions?: Readonly<Record<string, unknown>>;
  };

  checksum: `scd64:${string}`;
}

interface ArtGeneCoordinate {
  x: number;
  y: number;
  color?: string;
  role: string;
  partId?: string;
}
```

### 8.3 Mode validation

| Mode | Coordinates | Derived hints | Required fields |
|---|---|---|---|
| `explicit` | At least one | Optional, non-projecting metadata only | Coordinates |
| `derived` | Empty | At least one supported derived behavior | `contourFollow=true`, `contourPartId`, SDF available at projection |
| `hybrid` | At least one | At least one supported derived behavior | Coordinates plus derived requirements |

Unknown operational geometry hints are refused. Unknown metadata belongs under `geometryHints.extensions` and may not affect output.

### 8.4 Projection context

```ts
interface ArtProjectionContext {
  canvas: { width: number; height: number };
  compilerVersion: string;
  projectionAlgoVersion: number;
  conflictPolicyVersion: number;
  paletteRoleMappingVersion: string;

  sdfByPart: Readonly<Record<string, {
    checksum: `scd64:${string}`;
    width: number;
    height: number;
    values: readonly number[];
  }>>;
}
```

### 8.5 Projected cell provenance

```ts
interface ProjectedArtCell {
  x: number;
  y: number;
  color?: string;
  role: string;
  partId?: string;

  _gene: {
    assetId: string;
    geneId: string;
    genePriority: number;
    geneChecksum: `scd64:${string}`;
    projectionChecksum: `scd64:${string}`;
    passVersion: number;

    sourceCoordOrHint:
      | {
          type: 'coordinate';
          coordinateIndex: number;
          x: number;
          y: number;
        }
      | {
          type: 'geometryHint';
          hint: 'contourFollow';
          contourPartId: string;
          sdfChecksum: `scd64:${string}`;
        };

    overlap?: {
      replacedGeneId: string;
      policy: 'priority-then-geneId';
    };
  };
}
```

### 8.6 Projection result

```ts
interface ArtProjectionResult {
  cells: readonly ProjectedArtCell[];
  projectionChecksum: `scd64:${string}`;
  orderedGeneIds: readonly string[];
  conflicts: readonly ArtProjectionConflict[];
  projectionAlgoVersion: number;
  conflictPolicyVersion: number;
}
```

### 8.7 Approval record

```ts
interface ArtApprovalRecord {
  contract: 'PB-ART-APPROVAL-v1';

  assetId: string;
  geneId: string;
  geneChecksum: `scd64:${string}`;
  projectionChecksum: `scd64:${string}`;

  /** Canonical cell array + palette mapping + canvas. */
  previewModelChecksum: `scd64:${string}`;

  /** Deterministic SVG source + preview renderer version. */
  previewDocumentChecksum: `scd64:${string}`;
  previewRendererVersion: string;

  authority: {
    kind: 'human';
    source: 'interactive-human-gate';
    actorId: string;
  };

  /** Explicit input. Do not call Date.now() in deterministic core code. */
  approvedAt: string;

  projectionMode: 'explicit' | 'derived' | 'hybrid';
  projectionAlgoVersion: number;
  compilerVersion: string;
  conflictPolicyVersion: number;
}
```

### 8.8 Durable memory record

```ts
interface ArtMemoryRecord {
  contract: 'PB-ART-MEMORY-v1';
  eventId: string;
  eventType:
    | 'curation'
    | 'projection'
    | 'feel-warning'
    | 'replay';

  code:
    | 'PB-OK-v1-ART-GENE-CURATED'
    | 'PB-OK-v1-ART-PROJECTION-OK'
    | 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD';

  assetId: string;
  geneId: string;
  geneChecksum: `scd64:${string}`;
  projectionChecksum: `scd64:${string}`;

  approval?: ArtApprovalRecord;
  payload: Readonly<Record<string, unknown>>;
  eventChecksum: `scd64:${string}`;
}
```

The required composite query key is:

```js
{
  assetId,
  geneId,
  geneChecksum,
  projectionChecksum,
}
```

---

## 9. Hop-by-Hop Specification

### Hop 1: Intent → Ontology

**Build:** Extend `PB-SCDNA-GENE-v1` with `geneType: 'art-direction'` and the contracts in §8.

The art gene stores both the curated cells and the doctrine that explains them:

```js
{
  contract: 'PB-SCDNA-GENE-v1',
  version: '1.1.0',
  assetId: 'shrine-brazier',
  geneId: 'brazier-rim-light',
  geneType: 'art-direction',
  priority: 100,
  projectionMode: 'hybrid',
  canvas: { width: 24, height: 20 },
  bounds: { x: 3, y: 4, w: 18, h: 13 },
  role: 'rim-highlight',
  materialHint: 'obsidian',
  paletteRoles: ['core', 'rim', 'shadow'],
  coordinates: [
    { x: 5, y: 6, role: 'rim', partId: 'brazier-body' }
  ],
  geometryHints: {
    lightDir: 'upper-left',
    valueRamp: ['highlight', 'midtone', 'shadow'],
    contourFollow: true,
    contourPartId: 'brazier-body',
    rimWidth: 1,
    occlusionPolicy: 'respect-silhouette',
    cornerPolicy: 'preserve'
  },
  checksum: 'scd64:...'
}
```

#### Curation boundary

- The gene may exist in draft form before approval.
- Draft genes may be validated and previewed.
- Draft genes may not be committed to the approved store.
- Only the interactive human gate may produce an accepted `ArtApprovalRecord`.
- An approval binds the exact gene, projection, cell model, and deterministic SVG document.

### Hop 2: Ontology → Structure

**Build:** Add and register:

```text
codex/core/pixelbrain/scdl/passes/project-genes.pass.js
```

The pass performs these steps:

1. Filter to matching `assetId` and `geneType: art-direction`.
2. Refuse unapproved genes in production mode.
3. Canonically order genes by `priority`, then `geneId`.
4. Validate projection-mode requirements.
5. Resolve explicit coordinates.
6. Resolve derived contour cells from the explicitly named SDF part.
7. Apply deterministic overlap policy.
8. Compute the projection checksum from all bound inputs.
9. Attach final projection provenance to every surviving cell.
10. Return a frozen result without performing I/O or emitting events.

#### Conflict policy

Artistic layering must not depend on caller array order or accidental gene renaming.

Canonical order:

```text
priority ascending
then geneId ascending as deterministic tie-breaker
```

Later entries win on the same `(x, y)` coordinate.

Because priority is explicit, renaming a gene does not normally change its layer. `geneId` is used only when priorities are equal.

Every overwrite is recorded in `result.conflicts` and on the winning cell's provenance.

#### Contour projection

`contourFollow` requires:

- `geometryHints.contourPartId`,
- a matching entry in `context.sdfByPart`,
- an SDF checksum,
- valid `rimWidth`,
- and a supported `lightDir`.

The pass refuses rather than guessing when a part is absent or ambiguous.

The derived cell algorithm may:

1. identify SDF sign-change cells,
2. compute a deterministic boundary normal,
3. retain the light-facing boundary according to `lightDir`,
4. expand inward or outward according to `rimWidth`,
5. respect the configured occlusion and corner policies,
6. emit cells in canonical `(y, x)` order.

No RNG is allowed.

### Hop 3: Structure → Transmission

**Build:** Add an `ART_DIRECTION` family to `src/core/scd64/glossary.ts`.

The physical eight-slot wire contract remains unchanged. To avoid treating art as a bug domain in authoring code, add domain-aware aliases:

```ts
export const ART_SLOT_ALIASES = Object.freeze({
  CLASS: 'BUGCLASS',
  FRAME: 'COORDSYS',
  LAW: 'INVARIANT',
  DEGREE: 'MAGNITUDE',
  EXCLUSION: 'MASKING',
  ACCEPTANCE: 'GATE',
  FLOW: 'PROPAGATE',
  STATUS: 'VERDICT',
});
```

Example family:

```ts
export const ART_FAMILIES = Object.freeze({
  ART_DIRECTION: Object.freeze({
    versionByte: 'A1',
    domain: 'ART',
    description:
      'Curated aesthetic intent for light, value, contour, and material treatment.',
    canonicals: Object.freeze([
      {
        slot: ART_SLOT_ALIASES.CLASS,
        canonical: 'ARTCLASS:RIM_LIGHT:contour-follow+upper-left',
      },
      {
        slot: ART_SLOT_ALIASES.FRAME,
        canonical: 'COORDSYS:gene-coordinates+named-part-sdf',
      },
      {
        slot: ART_SLOT_ALIASES.LAW,
        canonical: 'INVARIANT:human-curated+deterministic-projection',
      },
      {
        slot: ART_SLOT_ALIASES.DEGREE,
        canonical: 'MAGNITUDE:rim-width+highlight-coverage+shadow-depth',
      },
      {
        slot: ART_SLOT_ALIASES.EXCLUSION,
        canonical: 'MASKING:explicit-occlusion-policy',
      },
      {
        slot: ART_SLOT_ALIASES.ACCEPTANCE,
        canonical: 'GATE:human-approval+feel-warn-only',
      },
      {
        slot: ART_SLOT_ALIASES.FLOW,
        canonical: 'PROPAGATE:gene-to-SCDL-to-raster-to-memory',
      },
      {
        slot: ART_SLOT_ALIASES.STATUS,
        canonical: 'VERDICT:curated+approved+replayable',
      },
    ]),
  }),
});
```

The glossary resolves the domain meaning associated with a checksum. The checksum itself does not encode prose.

### Hop 4: Transmission → Durable Memory

**Build:** Add three health codes:

```js
ART_GENE_CURATED:
  'PB-OK-v1-ART-GENE-CURATED',

ART_PROJECTION_OK:
  'PB-OK-v1-ART-PROJECTION-OK',

ART_FEEL_BELOW_THRESHOLD:
  'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
```

**Build:** Add an append-only art-memory ledger.

A health event must be persisted as an `ArtMemoryRecord` before the system describes it as memory.

Required retrieval dimensions:

- `assetId`
- `geneId`
- `geneChecksum`
- `projectionChecksum`
- `eventType`
- `code`
- `authority.actorId`, where present
- `projectionAlgoVersion`
- `compilerVersion`

#### Ledger rules

- Append-only JSONL.
- Stable serialization for event checksums.
- No silent repair of malformed rows.
- Empty files return an empty result.
- Duplicate event checksums are idempotent and do not append twice.
- Replays use `eventType: replay` and reference the original event checksum.
- Ledger writes occur outside the pure projection function.
- Event timestamps are explicit inputs or are supplied by an approved clock adapter, never by deterministic core code.

### Hop 5: Memory → Retrieval

**Build:** Add:

```text
steamdeck_brain/vaelrix_forcefield/scdna/capabilities/
  pixel-art-direction.capability.json
```

The capability packet is keyed to touched files and relevant compiler surfaces:

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
      "need": "rim or edge highlight that follows a named part silhouette",
      "canonical": "approved art-direction gene + contourPartId + deterministic project-genes pass",
      "path": "codex/core/pixelbrain/scdl/passes/project-genes.pass.js",
      "evidence": "brazier rim cells were previously anonymous hand-placed coordinates",
      "forbidden": [
        "hand-placing repeat contour work directly in SCDL",
        "using canvas-edge rim behavior for part silhouettes",
        "projecting an unapproved art gene",
        "guessing an SDF part when contourPartId is absent"
      ]
    },
    {
      "need": "causal provenance for a projected art cell",
      "canonical": "gene checksum + projection checksum + source coordinate or hint + pass epoch",
      "path": "codex/core/pixelbrain/scdl/passes/project-genes.pass.js",
      "forbidden": [
        "emitting projected cells without _gene provenance",
        "stripping provenance before packet diagnostics",
        "treating an emitted health event as durable memory before ledger persistence"
      ]
    }
  ],
  "checksum": "COMPILED_BY_CAPABILITY_COMPILER"
}
```

The capability packet does not inject every gene payload into every edit. It injects the canonical method, applicable constraints, and lookup path. Specific genes are retrieved by asset and checksum when required.

### Hop 6: Fitness Loop

**Extend:** Invoke `evaluateFeel` after deterministic projection and before approval.

```text
curated draft gene
  → project
  → evaluateFeel
  → warning or structural-health evidence
  → human preview
  → human decision
```

A low score emits a warning event. It does not change cells.

A high score means only that the current structural AMPs consider the projection healthy. It does not prove aesthetic success.

```js
{
  structuralVerdict: 'HEALTHY',
  aestheticApproval: 'REQUIRES_HUMAN',
  feelScore: 0.87
}
```

---

## 10. Pivotal Implementation Examples

### 10.1 Gene packet normalization

```js
// codex/core/pixelbrain/scdna-gene-packet.js

export const PROJECTION_ALGO_VERSION = 1;
export const CONFLICT_POLICY_VERSION = 1;

const PROJECTION_MODES = new Set(['explicit', 'derived', 'hybrid']);

export function createSCDNAGenePacket(input) {
  const projectionMode = input.projectionMode ?? 'explicit';

  if (!PROJECTION_MODES.has(projectionMode)) {
    throw new Error(`ART_GENE_INVALID_PROJECTION_MODE:${projectionMode}`);
  }

  const coordinates = normalizeCoordinates(input.coordinates ?? []);
  const geometryHints = normalizeArtGeometryHints(input.geometryHints ?? {});

  validateProjectionMode({ projectionMode, coordinates, geometryHints });

  const packet = {
    contract: 'PB-SCDNA-GENE-v1',
    version: '1.1.0',
    assetId: requireNonEmptyString(input.assetId, 'assetId'),
    geneId: requireNonEmptyString(input.geneId, 'geneId'),
    geneType: requireLiteral(input.geneType, 'art-direction', 'geneType'),
    priority: toSafeInteger(input.priority ?? 100),
    projectionMode,
    canvas: normalizeCanvas(input.canvas),
    bounds: normalizeOptionalBounds(input.bounds, coordinates, projectionMode),
    role: requireNonEmptyString(input.role, 'role'),
    materialHint: requireNonEmptyString(input.materialHint, 'materialHint'),
    paletteRoles: Object.freeze(normalizeStringSet(input.paletteRoles ?? [])),
    coordinates: Object.freeze(coordinates),
    geometryHints: deepFreeze(geometryHints),
  };

  return deepFreeze({
    ...packet,
    checksum: checksumStableJSON(packet),
  });
}
```

### 10.2 Stable projection checksum

Do not use a shallow JSON replacer array. It can discard nested fields such as `canvas.width` and `canvas.height`.

```js
function computeProjectionChecksum({ genes, context }) {
  const bound = {
    geneChecksums: genes.map((gene) => gene.checksum).sort(),
    canvas: {
      width: context.canvas.width,
      height: context.canvas.height,
    },
    sdfChecksums: Object.entries(context.sdfByPart)
      .map(([partId, sdf]) => ({ partId, checksum: sdf.checksum }))
      .sort((a, b) => a.partId.localeCompare(b.partId, 'en')),
    paletteRoleMappingVersion: context.paletteRoleMappingVersion,
    projectionAlgoVersion: context.projectionAlgoVersion,
    conflictPolicyVersion: context.conflictPolicyVersion,
    compilerVersion: context.compilerVersion,
  };

  return checksumStableJSON(bound);
}
```

### 10.3 Projection pass

```js
// codex/core/pixelbrain/scdl/passes/project-genes.pass.js

import {
  PROJECTION_ALGO_VERSION,
  CONFLICT_POLICY_VERSION,
} from '../../scdna-gene-packet.js';

export function projectGenes(inputGenes, context) {
  const genes = [...inputGenes]
    .filter((gene) => gene.geneType === 'art-direction')
    .sort(compareGenesCanonically);

  const projectionChecksum = computeProjectionChecksum({ genes, context });
  const cellsByCoordinate = new Map();
  const conflicts = [];

  for (const gene of genes) {
    assertApprovedForProjection(gene, context.approvalsByGeneChecksum);

    const projected = projectSingleGene(gene, context);

    for (const draftCell of projected) {
      const key = `${draftCell.x}:${draftCell.y}`;
      const replaced = cellsByCoordinate.get(key);

      const cell = attachFinalProvenance({
        draftCell,
        gene,
        projectionChecksum,
        replaced,
        projectionAlgoVersion: context.projectionAlgoVersion,
      });

      if (replaced) {
        conflicts.push(Object.freeze({
          x: cell.x,
          y: cell.y,
          winningGeneId: gene.geneId,
          replacedGeneId: replaced._gene.geneId,
          policy: 'priority-then-geneId',
        }));
      }

      cellsByCoordinate.set(key, cell);
    }
  }

  const cells = [...cellsByCoordinate.values()]
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map(Object.freeze);

  return deepFreeze({
    cells,
    projectionChecksum,
    orderedGeneIds: genes.map((gene) => gene.geneId),
    conflicts,
    projectionAlgoVersion: context.projectionAlgoVersion,
    conflictPolicyVersion: context.conflictPolicyVersion,
  });
}

function compareGenesCanonically(a, b) {
  return a.priority - b.priority || a.geneId.localeCompare(b.geneId, 'en');
}
```

### 10.4 Human approval gate

```js
export function commitGene({ gene, projection, preview, approval, compilerVersion }) {
  assertHumanAuthority(approval?.authority);

  if (approval.geneChecksum !== gene.checksum) {
    throw new Error('ART_APPROVAL_GENE_CHECKSUM_MISMATCH');
  }

  if (approval.projectionChecksum !== projection.projectionChecksum) {
    throw new Error('ART_APPROVAL_PROJECTION_CHECKSUM_MISMATCH');
  }

  if (approval.previewModelChecksum !== preview.modelChecksum) {
    throw new Error('ART_APPROVAL_PREVIEW_MODEL_MISMATCH');
  }

  if (approval.previewDocumentChecksum !== preview.documentChecksum) {
    throw new Error('ART_APPROVAL_PREVIEW_DOCUMENT_MISMATCH');
  }

  const memoryRecord = createArtMemoryRecord({
    eventType: 'curation',
    code: 'PB-OK-v1-ART-GENE-CURATED',
    assetId: gene.assetId,
    geneId: gene.geneId,
    geneChecksum: gene.checksum,
    projectionChecksum: projection.projectionChecksum,
    approval: {
      ...approval,
      compilerVersion,
    },
    payload: {
      projectionMode: gene.projectionMode,
      cellCount: projection.cells.length,
      conflictCount: projection.conflicts.length,
    },
  });

  appendArtMemoryRecord(memoryRecord);
  return memoryRecord;
}
```

### 10.5 Durable ledger

```js
const LEDGER_PATH = resolveArtMemoryLedgerPath();

export function appendArtMemoryRecord(record) {
  validateArtMemoryRecord(record);

  if (hasEventChecksum(record.eventChecksum)) {
    return { status: 'already-present', record };
  }

  fs.appendFileSync(
    LEDGER_PATH,
    `${stableStringify(record)}\n`,
    { encoding: 'utf8', flag: 'a' }
  );

  return { status: 'appended', record };
}

export function queryArtMemoryLedger(filters = {}) {
  if (!fs.existsSync(LEDGER_PATH)) return [];

  const text = fs.readFileSync(LEDGER_PATH, 'utf8');
  if (text.trim() === '') return [];

  return text
    .split('\n')
    .filter(Boolean)
    .map(parseAndValidateLedgerLine)
    .filter((record) => matchesFilters(record, filters));
}
```

### 10.6 Deterministic preview

The preview has two identities:

```js
const modelChecksum = checksumStableJSON({
  canvas,
  cells,
  paletteRoleMappingVersion,
});

const svgSource = renderDeterministicArtPreviewSVG({
  canvas,
  cells,
  rendererVersion: PREVIEW_RENDERER_VERSION,
});

const documentChecksum = checksumBytes(svgSource);
```

Do not checksum browser-rendered pixels.

### 10.7 Feel gate

```js
export function evaluateArtProjection({ projection, assetId, threshold }) {
  const score = evaluateFeel(projection.cells, assetId);

  if (score.spatialAwareness < threshold) {
    return {
      score,
      event: createArtMemoryRecord({
        eventType: 'feel-warning',
        code: 'PB-WARN-v1-ART-FEEL-BELOW-THRESHOLD',
        assetId,
        geneId: 'MULTI_GENE_PROJECTION',
        geneChecksum: checksumGeneSet(projection),
        projectionChecksum: projection.projectionChecksum,
        payload: {
          score: score.spatialAwareness,
          threshold,
          action: 'none',
          aestheticApproval: 'REQUIRES_HUMAN',
        },
      }),
    };
  }

  return { score, event: null };
}
```

---

## 11. Functional Acceptance Criteria

| Capability | Acceptance criteria |
|---|---|
| Art-gene creation | `createSCDNAGenePacket()` returns a deeply frozen `PB-SCDNA-GENE-v1` packet with an `scd64:` checksum. |
| Mode validation | Explicit, derived, and hybrid genes refuse invalid field combinations. |
| Live dependency edge | The production SCDL compiler imports or registers the gene packet through `project-genes.pass.js`; dead-code status disappears through reachability, not report editing. |
| Deterministic projection | Identical genes and projection context produce byte-identical results across 100 runs. |
| Permutation stability | Shuffling input gene order does not change output. |
| Conflict stability | Priority controls overlap; `geneId` is a deterministic tie-breaker only. |
| Projection identity | Changing canvas, SDF checksum, palette mapping version, projection epoch, conflict policy, or compiler version changes `projectionChecksum`. |
| Causal provenance | Every surviving cell carries complete final provenance including `projectionChecksum`. |
| Human authority | A commit without validated interactive human authority refuses. |
| Preview binding | Approval refuses when either preview checksum differs from the approved record. |
| Durable memory | Curation and projection events are queryable by asset, gene, gene checksum, and projection checksum after process restart. |
| Retrieval injection | Editing a matching `.scdl` file injects the art capability; unrelated UI files do not. |
| Feel gate | A low score emits and persists a warning without changing any cells. |
| Backward compatibility | No genes or disabled flag produces byte-identical pre-feature output. |

---

## 12. Non-Functional Requirements

| Property | Requirement |
|---|---|
| Determinism | Same bound inputs produce same canonical bytes. |
| Projection latency | Up to 50 genes on a 64×64 canvas completes in under 50 ms without I/O. |
| Purity | Projection core performs no filesystem, network, clock, log, or event writes. |
| Durability | Ledger rows survive process restart and remain queryable. |
| Idempotence | Re-emitting the same event checksum does not duplicate the ledger row. |
| Accessibility | Preview SVG has a text summary, labeled grid, role metadata, and keyboard-readable approval controls. |
| Backward compatibility | Existing no-gene compilation remains byte-identical. |
| Explainability | Conflict results and cell provenance are available in diagnostics. |
| Version safety | Output-affecting projection changes require projection epoch increment. |

---

## 13. Assumptions

- `PB-SCDNA-GENE-v1` is extensible without breaking existing consumers.
- Existing stable checksum utilities can deeply canonicalize nested values.
- Capability injection can serve the art packet through existing surface globs.
- SDF data can be exposed to the projection pass with a stable checksum per part.
- `evaluateFeel` is deterministic enough for warn-only use.
- The eight SCD64 wire slots can be reused across domains, or can accept domain-aware authoring aliases without changing the wire format.
- Approval time is provided explicitly or by an approved injected clock adapter.

---

## 14. Open Questions and Escalations

### 14.1 SDF ownership and lifetime

**Owner:** PixelBrain compiler owner  
**Question:** At which exact pass boundary is canonical SDF data available, and is its checksum already stable?  
**Required answer before:** Projection pass implementation  
**Failure policy:** Refuse derived contour projection if canonical SDF data is unavailable.

### 14.2 Approval authority adapter

**Owner:** Repository owner  
**Question:** Which existing CLI or cockpit identity mechanism can mint `authority.source = interactive-human-gate` without allowing an agent to self-assert it?  
**Required answer before:** Durable commit implementation  
**Failure policy:** Preview is allowed, commit remains disabled.

### 14.3 SCD64 slot validation

**Owner:** SCD64 maintainer  
**Question:** Are slot names positional channels or semantically restricted to bug-domain values?  
**Required answer before:** Art glossary merge  
**Preferred resolution:** Preserve eight wire slots and use domain-aware aliases at authoring time.

### 14.4 Feel threshold calibration

**Owner:** Curator  
**Question:** Does the current Silhouette AMP identify broken contour projection reliably enough to set a default threshold?  
**Required answer before:** Enabling warnings in canary mode  
**Failure policy:** Record scores without warning until calibrated.

---

## 15. File Map

```text
codex/core/pixelbrain/
├── scdna-gene-packet.js
│   └── EXTEND: art gene schema, projection epoch, conflict policy version
├── scdna-art-gene-store.js
│   └── NEW: append-only durable memory ledger
├── scdna-art-gene-compiler.js
│   └── NEW: validate → project → preview → human approval → commit
├── art-gene-ledger.jsonl
│   └── GENERATED: append-only memory records
└── scdl/passes/
    └── project-genes.pass.js
        └── NEW: pure deterministic gene projection

src/core/scd64/
├── glossary.ts
│   └── EXTEND: ART_FAMILIES and ART_SLOT_ALIASES
└── constants.ts
    └── PRESERVE: physical eight-slot wire contract

codex/core/diagnostic/
└── diagnostic-constants.js
    └── EXTEND: art health codes

steamdeck_brain/vaelrix_forcefield/scdna/
└── capabilities/
    └── pixel-art-direction.capability.json
        └── NEW: retrieval mnemonic

PolarisOS/scripts/
└── scdl-to-polaris.mjs
    └── EXTEND: warn-only Feel evaluation after art projection

approval-preview/
└── TBD component path
    └── NEW: deterministic accessible SVG approval document
```

---

## 16. Dependency-Respecting Build Order

### Phase 0: Preflight

**Goal:** Resolve the three live-contract unknowns before writing behavior.

- Confirm the SCDL pass registry and exact import path.
- Confirm where named-part SDFs become available.
- Confirm deep stable serialization utility behavior.
- Confirm SCD64 slot validation rules.
- Confirm human approval authority source.

**Exit criteria:** Each dependency has an owner and a tested seam.

### Phase 1: Revive and extend the gene packet

- Add live import edge through the registered projection pass.
- Add art gene schema and mode validation.
- Add projection and conflict-policy versions.
- Add deep freeze and deep canonical checksum.
- Add tests for nested object order, value-ramp order, palette-role normalization, and mode refusal.

**Feature flag:** `SCDNA_ART_GENES_ENABLED=false`

### Phase 2: Implement deterministic projection

- Add `project-genes.pass.js`.
- Accept explicit projection context.
- Add canonical gene ordering.
- Add named-part SDF contour projection.
- Add deterministic conflict resolution.
- Compute projection checksum before final provenance attachment.
- Return frozen diagnostics and conflicts.

### Phase 3: Add transmission vocabulary

- Add art family.
- Add authoring aliases if slot validation permits.
- Verify existing bug-family output remains byte-identical.

### Phase 4: Add health contracts and durable ledger

- Add health constants.
- Add memory record schema.
- Add append, idempotence, query, malformed-line refusal, and restart tests.
- Ensure ledger records include both `assetId` and `geneId`.

### Phase 5: Build deterministic preview and approval boundary

- Render canonical model.
- Render deterministic SVG source.
- Compute both preview checksums.
- Require validated interactive human authority.
- Bind approval to gene, projection, model preview, and document preview.

### Phase 6: Add retrieval packet

- Compile and register `pixel-art-direction.capability.json`.
- Verify positive and negative surface matches.
- Verify serve-log behavior and re-arm policy.

### Phase 7: Wire Feel evaluation

- Invoke after projection.
- Persist warning event only when configured threshold is crossed.
- Do not mutate projection or gene.
- Display structural score separately from human aesthetic approval.

### Phase 8: Canary and rollout

- Convert the brazier rim into an art gene.
- Compare old and projected cell arrays.
- Compare raster output.
- Approve through the real preview path.
- Verify ledger and retrieval loop.

---

## 17. QA Plan

### 17.1 New test files

| File | Scope |
|---|---|
| `codex/core/pixelbrain/__tests__/scdna-art-gene.test.js` | Schema, modes, deep freeze, stable checksum |
| `codex/core/pixelbrain/__tests__/project-genes.test.js` | Projection, order independence, conflicts, provenance |
| `codex/core/pixelbrain/__tests__/scdna-art-gene-store.test.js` | Durable append, idempotence, query, restart |
| `codex/core/pixelbrain/__tests__/scdna-art-gene-compiler.test.js` | Approval authority and checksum binding |
| `src/core/scd64/__tests__/art-family.test.ts` | Art family and wire compatibility |
| `approval-preview/__tests__/art-preview.test.*` | Model and deterministic SVG checksums |

### 17.2 Required determinism matrix

The projection checksum must change when any output-bearing input changes:

- gene checksum,
- canvas width,
- canvas height,
- SDF checksum,
- palette-role mapping version,
- projection algorithm epoch,
- conflict policy version,
- compiler version.

It must remain stable when only these change:

- input gene array order,
- object property insertion order,
- ledger event timestamp,
- approval actor display label that is not part of the projection context,
- non-operational `geometryHints.extensions` metadata, unless explicitly included in gene identity by policy.

### 17.3 Required tests

#### 100-run replay

```js
it('returns byte-identical projection across 100 runs', () => {
  const outputs = new Set();

  for (let index = 0; index < 100; index += 1) {
    outputs.add(stableStringify(projectGenes(genes, context)));
  }

  expect(outputs.size).toBe(1);
});
```

#### Permutation stability

```js
it('is independent of caller gene array order', () => {
  const baseline = projectGenes([geneA, geneB, geneC], context);
  const shuffled = projectGenes([geneC, geneA, geneB], context);

  expect(stableStringify(shuffled)).toBe(stableStringify(baseline));
});
```

#### Projection epoch invalidation

```js
it('changes projection identity when projection epoch changes', () => {
  const first = projectGenes(genes, {
    ...context,
    projectionAlgoVersion: 1,
  });

  const second = projectGenes(genes, {
    ...context,
    projectionAlgoVersion: 2,
  });

  expect(second.projectionChecksum).not.toBe(first.projectionChecksum);
});
```

#### Nested canvas binding

```js
it('binds nested canvas dimensions into projection identity', () => {
  const small = projectGenes(genes, {
    ...context,
    canvas: { width: 8, height: 8 },
  });

  const large = projectGenes(genes, {
    ...context,
    canvas: { width: 64, height: 64 },
  });

  expect(large.projectionChecksum).not.toBe(small.projectionChecksum);
});
```

#### Authority refusal

```js
it('refuses an agent-asserted approval string', () => {
  expect(() => commitGene({
    gene,
    projection,
    preview,
    approval: {
      approvedBy: 'human-trust-me'
    },
    compilerVersion: '1.0.0',
  })).toThrow('ART_GENE_REQUIRES_HUMAN_APPROVAL');
});
```

#### Durable composite lookup

```js
it('retrieves the curation row by complete causal identity', () => {
  const matches = queryArtMemoryLedger({
    assetId: gene.assetId,
    geneId: gene.geneId,
    geneChecksum: gene.checksum,
    projectionChecksum: projection.projectionChecksum,
  });

  expect(matches).toHaveLength(1);
});
```

#### No-gene regression

```js
it('is a strict no-op when no genes apply', () => {
  expect(projectGenes([], context)).toEqual({
    cells: [],
    projectionChecksum: checksumEmptyProjection(context),
    orderedGeneIds: [],
    conflicts: [],
    projectionAlgoVersion: context.projectionAlgoVersion,
    conflictPolicyVersion: context.conflictPolicyVersion,
  });
});
```

At the compiler integration level, a no-gene pass must not alter the preexisting SCDL output packet.

### 17.4 Commands

```bash
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene.test.js
npx vitest run codex/core/pixelbrain/__tests__/project-genes.test.js
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene-store.test.js
npx vitest run codex/core/pixelbrain/__tests__/scdna-art-gene-compiler.test.js
npx vitest run src/core/scd64/__tests__/art-family.test.ts

npm run test
npm run typecheck
```

---

## 18. Regression Risks and Retest Checklist

| Risk | Failure mode | Required retest |
|---|---|---|
| Existing SCDL behavior changes | Registered pass modifies no-gene output | Compile `brazier.scdl` with feature disabled and compare canonical bytes |
| Raster output changes | Provenance or projection data leaks into raster semantics | Rasterize existing assets and compare approved image hashes |
| Checksum collision by omitted nested data | Canvas or SDF fields disappear during serialization | Nested-field checksum tests |
| Caller-order nondeterminism | Gene array order changes overlap result | Permutation test |
| Rename-driven art change | `geneId` acts as primary layer control | Priority tests; rename with unchanged priority |
| Stale approval accepted | Projection epoch changes but approval remains valid | Epoch bump → checksum mismatch → commit refusal |
| Fake human approval | Agent supplies a truthy string | Authority-source refusal test |
| Event-only pseudo-memory | Health event logs but is not durable | Restart process and query ledger |
| Preview mismatch | Human approves one document and commit binds another | Dual-preview checksum mismatch tests |
| SCD64 regression | Art family breaks bug family validators | Full SCD64 test suite and byte snapshots |
| Retrieval wallpaper | Packet injects too broadly or too often | Positive/negative surface tests and serve-log review |
| Feel becomes taste authority | High score auto-approves or low score mutates | Mutation spy test and approval-state assertion |

---

## 19. Rollout

### 19.1 Feature flag

```text
SCDNA_ART_GENES_ENABLED=false
```

Default is false.

### 19.2 Shadow mode

- Register the pass.
- Keep it disabled.
- Run schema, checksum, projection, and ledger tests in CI.
- Confirm dead-code reachability through the real compiler graph.

### 19.3 Canary

Enable only for `shrine-brazier`.

Canary requirements:

1. Reproduce the existing 23 rim cells as an explicit or hybrid gene.
2. Project them deterministically.
3. Compare projected cell coordinates to the original SCDL cells.
4. Compare raster output.
5. Render the deterministic preview.
6. Approve through the interactive human gate.
7. Persist curation and projection events.
8. Edit `brazier.scdl` and verify capability injection.
9. Retrieve the gene and approval by SCD64 address.

### 19.4 Rollback

1. Set `SCDNA_ART_GENES_ENABLED=false`.
2. Remove or disable the art capability packet.
3. Leave the append-only ledger intact for auditability.
4. Existing SCDL continues through the original path.

The ledger should not be deleted as a routine rollback action. It is inert when the feature is disabled and preserves causal history.

---

## 20. Definition of Done

- [ ] `scdna-gene-packet.js` is reachable through a live production import edge.
- [ ] `art-direction` genes validate explicit, derived, and hybrid modes.
- [ ] Gene packets are deeply frozen and deeply checksummed.
- [ ] `PROJECTION_ALGO_VERSION` is a monotonic integer epoch.
- [ ] `project-genes.pass.js` is registered and feature-gated.
- [ ] Projection context explicitly binds canvas, SDF checksums, palette mapping, compiler version, conflict policy, and projection epoch.
- [ ] Input gene permutation does not change output.
- [ ] Priority controls overlaps; `geneId` only breaks ties.
- [ ] Every projected cell carries final projection checksum and source provenance.
- [ ] Projection checksum changes when any output-bearing input changes.
- [ ] Art SCD64 family validates without changing the eight-slot wire format.
- [ ] Human approval requires validated interactive authority, not a string.
- [ ] Approval binds gene, projection, preview model, and preview document checksums.
- [ ] Curation and projection health events persist to the durable ledger.
- [ ] Ledger records include `assetId` and `geneId` and survive process restart.
- [ ] Duplicate event checksums do not append duplicate rows.
- [ ] Art capability injects for matching SCDL surfaces and not unrelated files.
- [ ] Low Feel score persists a warning and mutates nothing.
- [ ] Existing `brazier.scdl` output remains byte-identical when genes are disabled or absent.
- [ ] Full test and typecheck suites pass.
- [ ] Dead-code finding is removed only after the module becomes reachable.
- [ ] PIR is filed after Phase 8.

---

## 21. Final Architectural Verdict

**Approved with bounded implementation risk.**

This design closes the intent-to-art gap without pretending the machine understands beauty and without weakening the Curation Law.

The machine does not create taste. It receives a curated decision and preserves its causal structure across representation, projection, transmission, memory, retrieval, and evaluation.

The decisive contracts are:

```text
SCDNA preserves intent.
SCDL manifests structure.
SCD64 addresses identity.
BytecodeHealth describes events.
The durable ledger turns events into memory.
Capability retrieval recalls applicable doctrine.
Feel evaluation warns.
The human approves.
```

The primary failure mode is causal drift, where stable intent is interpreted by a changed projection law. This is mitigated through separate gene and projection checksums, an explicit projection epoch, SDF and policy checksum binding, and mandatory reapproval when projection identity changes.

The secondary failure mode is false approval provenance. This is mitigated by requiring an interactive human authority adapter and binding approval to both the canonical cell model and deterministic preview document.

With those invariants enforced, a brazier rim cell is no longer an unexplained coordinate. It becomes a replayable causal artifact with lineage, transformation law, approval evidence, health history, and retrieval semantics.

---

## 22. Post-Implementation Report Handoff

**PIR filename:**

```text
docs/scholomance-encyclopedia/post-implementation-reports/
PIR-20260725-ONTOLOGICAL-ART-DIRECTION.md
```

**Due:** Within seven days of canary completion.

The PIR must contain:

- 100-run deterministic projection results,
- permutation-stability results,
- projection epoch invalidation proof,
- nested canvas and SDF checksum-binding proof,
- before and after brazier cell comparison,
- before and after raster comparison,
- approval authority evidence,
- both preview checksums,
- durable ledger row count and composite lookup example,
- capability serve-log excerpt,
- Feel score and warning behavior,
- conflict diagnostics,
- rollback verification,
- and any newly discovered pathology requiring Cleri registration.

---

*End of PDR.*
