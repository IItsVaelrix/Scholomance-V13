# Scholomance Verified Asset Pipeline
## From Curated Intent to Deterministic Pixels

**Date:** 2026-07-29

**Status:** Verified implementation white paper

**Audience:** Stakeholders, technical artists, engine contributors, and QA

**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-VERIFIED-ASSET-PIPELINE`

---

## Executive Abstract

Scholomance's asset pipeline separates four questions that conventional pixel
workflows often collapse:

1. **What is intended?**
2. **What geometry lawfully satisfies that intent?**
3. **How should the accepted geometry look?**
4. **How does that appearance become pixels?**

The verified implementation answers those questions through distinct,
deterministic boundaries:

```text
intent -> geometry -> appearance -> raster
```

Relational shape may be authored through the
`PB-GEOMETRY-CONSTRUCTION-v1` solver. Structural coordinates and material
semantics enter an SCDL/PixelBrain asset packet. The Vixel Render Intermediate
Representation (VRI) compiler lowers that packet and its explicit appearance
inputs into a layered `PB-VRI-v1` scene. The VRI renderer then executes an
ordered set of pure passes to produce an RGBA byte buffer.

The production value is practical:

- geometry can be refused when its constraints are false;
- the same accepted inputs rebuild the same result;
- texture follows declared object, surface, world, or screen space;
- lighting and atmosphere remain separate from structural coordinates;
- authored pixels remain an explicit final override;
- and each stage exposes a boundary that can be tested independently.

This is not a claim that the engine creates taste. The verified runtime
preserves and projects supplied intent. Human aesthetic authority remains a
governing design principle, while several proposed approval and memory systems
are not part of the current VRI runtime.

---

## 1. Evidence Declaration

This paper distinguishes implementation from architectural context.

| Classification | Meaning in this paper |
|---|---|
| **Verified current capability** | Present in current source and supported by focused executable tests or an implemented, ratified contract |
| **Approved design context** | A repository-approved direction that explains intent but is not claimed as current runtime behavior |
| **Explicit non-claim** | A schema concept, future connection, or stronger guarantee that the current implementation does not establish |

### 1.1 Verified current capability

- `PB-GEOMETRY-CONSTRUCTION-v1` packet creation, solving, constraint
  verification, validation, identity, immutability, and Wand integration.
- `PB-VRI-COMPILE-v2` lowering from coordinate-bearing asset packets or
  caller-lowered scene graphs into `PB-VRI-v1`.
- Material-driven texture selection and texture coordinate-space assignment.
- Explicit art-gene cells, gene coordinates, and supported gene-binding
  effects.
- Deterministic geometry, texture, mark, lighting, fog/grading, and raster
  patch rendering.
- Integer-scale RGBA output.

### 1.2 Approved design context

The ontological art-direction PDR defines a larger causal loop:

```text
curated gene
  -> deterministic projection
  -> approval-bound preview
  -> durable art-memory ledger
  -> capability retrieval
  -> warn-only Feel evaluation
```

That design establishes important authority and provenance principles. This
paper does not present its ledger, capability retrieval, interactive approval
adapter, or Feel-warning loop as implemented VRI runtime behavior.

### 1.3 Explicit non-claims

This paper does not claim:

- that `compileVRI()` invokes the construction solver;
- that the VRI checksum is cryptographic;
- that a VRI scene is recursively immutable;
- that the renderer executes bloom, general masks, or general composite layers;
- that every declared VRI enum has a dedicated renderer implementation;
- that the VRI compiler validates human approval records;
- or that VRI refusal currently uses `PB-ERR-v1`.

---

## 2. The Architectural Thesis

The pipeline's central decision is separation of authority.

### 2.1 Intent is not geometry

An instruction such as "the bowl is tangent to the stem" is a relationship,
not a list of pixels. The construction solver accepts named anchors, analytic
primitive families, constraints, and validation laws. It either returns solved
geometry with evidence or refuses.

### 2.2 Geometry is not appearance

Coordinates establish where an asset exists. They do not fully specify how
bark grain flows, how steel catches a rim light, where fog accumulates, or
which authored highlight must win at the end. VRI owns that appearance layer.

### 2.3 Appearance is not raster authority

VRI is still an intermediate representation. The renderer determines coverage,
texture evaluation, blending, lighting, grading, and final byte layout through
an explicit pass order.

### 2.4 Determinism is a boundary property

Each core stage is designed as a pure transformation:

```text
construction spec -> solved geometry
asset packet + appearance options -> VRI scene
VRI scene + scale -> RGBA bytes
```

No hidden random source, filesystem read, wall clock, or network request is
needed in those transformations.

---

## 3. Verified System Map

```text
Authored SCDL / Wand intent
          │
          │ optional construction_request
          ▼
PB-GEOMETRY-CONSTRUCTION-v1
          │  solved parts, contours, tangents,
          │  normals, curvature, measurements
          ▼
Accepted coordinates + material/vector metadata
          │
          ▼
SCDL / PixelBrain asset packet
          │
          ├──────── artGenes
          ├──────── shaderPacket
          ├──────── lighting
          ├──────── atmosphere
          ├──────── rasterPatches
          └──────── loweredCoordinates for scene-graph input
          │
          ▼
compileVRI(packet, options)
PB-VRI-COMPILE-v2
          │
          ▼
PB-VRI-v1 scene
layers + lights + atmosphere + provenance + checksum
          │
          ▼
renderVRI(scene, scale)
PB-VRI-RENDER-v1
          │
          ▼
{ width, height, data: Uint8Array }
RGBA output
```

The arrows describe composition, not one monolithic call stack. Construction
is an optional upstream authoring path. `compileVRI()` consumes coordinates
already present in an asset packet or provided by a caller's scene-graph
lowering step.

| Stage | Primary authority | Verified result |
|---|---|---|
| Construction | Named primitives, anchors, constraints, validation laws | Solved vector geometry or structured refusal |
| SCDL/asset packet | Structural coordinates, parts, colors, materials | Coordinate-bearing asset semantics |
| VRI compiler | Texture, marks, lights, atmosphere, explicit patches | Layered render scene |
| VRI renderer | Ordered deterministic passes | RGBA byte buffer |

---

## 4. Geometric Construction: Relational Intent Becomes Coordinates

### 4.1 Contract

`createConstruction(spec)` is the packet-authoring boundary for
`PB-GEOMETRY-CONSTRUCTION-v1`. A construction includes:

- a stable ID;
- an integer canvas from 1 through 256 cells on each axis;
- named anchors;
- ordered parts;
- declared constraints;
- and validation laws.

The complete object graph is validated before solving. Part IDs must be unique,
references must resolve, numeric fields must be finite, and part dependencies
must be acyclic. Unsupported JavaScript values and cyclic caller objects are
refused rather than silently erased during serialization.

### 4.2 Primitive vocabulary

The implemented solver supports eleven domain-specific families:

| Family | Typical responsibility |
|---|---|
| `ellipse` | Elliptic closed form |
| `conic-bowl` | Bowl or cup profile |
| `tapered-ribbon` | Directional band with taper |
| `capsule` | Rounded linear body |
| `width-profile-ribbon` | Centerline with authored width profile |
| `branch-graph` | Connected branching structure |
| `radial-shard-cluster` | Radially organized shards |
| `architectural-module-stack` | Repeated or stacked construction modules |
| `offset-contour` | Contour derived at an offset |
| `rounded-polygon` | Polygon with rounded transitions |
| `bezier-chain` | Chained parametric curves |

This is intentionally not a general nonlinear optimizer. Constructors build
known geometric families; the solver does not invent a missing form.

### 4.3 Constraint responsibility

Fifteen constraint kinds are supported, with responsibility made explicit:

| Responsibility | Constraint kinds | Behavior |
|---|---|---|
| Constructor-enforced | `tangent`, `ratio`, `monotonic-taper`, `maximum-curvature` | The constructor creates geometry intended to satisfy the law; verification still checks it |
| Transform-enforced | `coaxial`, `concentric`, `coincident`, `connected` | A deterministic translation may be applied, followed by verification |
| Verification-only | `parallel`, `perpendicular`, `symmetric`, `mirror-symmetry`, `contained`, `equal-length`, `minimum-distance` | Geometry is not silently altered to make the assertion true |

Every declared constraint is verified again after the complete transform pass.
This prevents a later translation from silently invalidating an earlier
relationship.

An unresolved part, point, measurement, or axis fails the construction. A
verification-only law is never treated as a no-op.

### 4.4 Validation laws

Validation can require:

- specific parts to be closed;
- absence of self-intersections;
- consistent clockwise or counterclockwise winding;
- a minimum curvature radius;
- a connected assembly;
- optional canvas containment;
- and an explicit connection tolerance.

Canvas containment checks all emitted centerlines, banks, contours, and named
points. Assembly connectivity uses geometric contact within the configured
tolerance.

### 4.5 Solver result

Each solved part can carry:

- a spine;
- left and right banks;
- a closed contour;
- tangent and surface-normal samples;
- curvature samples;
- arc length;
- named points;
- and measurements.

The result also contains a validation report, the construction checksum, and a
result checksum. Geometric output is quantized to three decimal places.

### 4.6 Identity and immutability

Construction identity uses canonical JSON with recursively sorted object keys
and preserved array order. Both construction and result identities use:

```text
sha256-canonical-v1:<64 lowercase hexadecimal characters>
```

The construction checksum binds the contract, versions, ID, canvas, anchors,
part order, constraints, and validation laws. The result checksum binds the
solver version and complete solved-part graph.

Accepted input is defensively cloned and recursively frozen. Solver results,
nested arrays, tuples, measurements, reports, checks, and failures are also
recursively frozen.

### 4.7 Wand boundary and refusal

The accepted Wand envelope is nested:

```js
{
  coordinateFormula: {
    type: 'construction_request',
    construction: {
      // GeometryConstructionSpec fields
    },
  },
}
```

Construction evaluation is default-off and requires:

```js
{ geometryConstructionEnabled: true }
```

Invalid public construction paths refuse with `PB-ERR-v1` categories:

| Category | Use |
|---|---|
| `VALUE` | Invalid or unsupported authored value |
| `RANGE` | Numeric, finite-number, or canvas-size violation |
| `STATE` | Unknown references or cyclic dependencies |
| `FORMULA` | Invalid packet boundary, disabled feature, or malformed Wand envelope |
| `COORD` | Constructor, constraint, validation, or containment failure |

This refusal model is a major production distinction: a false constraint does
not become a plausible-looking partial asset.

---

## 5. SCDL and VRI: Structure Hands Off to Appearance

SCDL is the structural authoring layer. Its compiled packet supplies canvas
dimensions and geometry coordinates, including colors, materials, and vector
metadata where available.

VRI is the appearance layer between those semantics and final raster output:

```text
SCDL says what exists.
VRI says how accepted geometry looks.
```

The boundary allows a geometric construction to remain stable while material
grain, lighting, atmospheric treatment, and authored mark-making vary as
separate inputs.

---

## 6. VRI Compilation

### 6.1 Compiler contract

The compiler is a pure function:

```js
compileVRI(packet, options) -> frozen PB-VRI-v1 scene
```

Its primary optional inputs are:

| Input | Responsibility |
|---|---|
| `artGenes` | Explicit gene cells, gene coordinates, and supported appearance bindings |
| `shaderPacket` | Additional declared lights |
| `lighting` | Key, rim, ambient, and point-light configuration |
| `atmosphere` | Fog, bloom description, and grading description |
| `rasterPatches` | Authored pixel overrides |
| `loweredCoordinates` | Caller-produced coordinates for scene-graph packets |

For coordinate-mode packets, the compiler reads
`packet.geometry.coordinates`. For `scene-graph` mode, it validates the
`PB-SCENE-GRAPH-v1` contract and requires non-empty caller-supplied lowered
coordinates. It refuses rather than silently compiling an empty scene.

### 6.2 Geometry layer

Coordinates become the base geometry layer with:

- SDF coverage mode;
- antialiasing width;
- depth band zero;
- and the original coordinate payload.

This is the structural surface upon which later texture and lighting passes
operate.

### 6.3 Material-driven texture layers

The compiler discovers distinct materials in the coordinate set. Known
materials map to deterministic texture kinds such as:

- metal grain;
- bark;
- foliage;
- moss;
- fabric;
- crystal;
- water;
- cloud.

Each material receives fixed texture parameters and a numeric seed derived
from its material name through FNV-1a. There is no runtime RNG.

### 6.4 Texture coordinate spaces

Texture space determines what the texture stays attached to:

| Space | Meaning | Current examples |
|---|---|---|
| `object` | Follows the part's local tangent/normal frame | Bark, metal, fabric, crystal, corrosion |
| `surface` | Aligns to surface flow while retaining canvas position | Water |
| `world` | Remains fixed in logical canvas space | Cloud, dirt |
| `screen` | Remains fixed in output-oriented space | Available to VRI texture payloads |

This prevents material patterns from behaving like a screen overlay when they
should follow a curved or transformed part.

### 6.5 Art-gene inputs

Current compilation supports two explicit gene manifestations:

1. `geometryHints.cells` become monochrome mark layers with pressure and width.
2. `gene.coordinates` become color-bearing raster-patch layers.

Supported bindings can influence:

- lighting through rim increase or added glow;
- atmosphere through fog, bloom description, or warm grading;
- texture through increased grain;
- contour through geometry-layer antialiasing width;
- density through mark pressure.

Geometry and palette binding intent is recorded in provenance for downstream
interpretation; it does not deform geometry or recolor the scene inside the
current compiler. Unknown binding channels are ignored for forward
compatibility.

The compiler does not verify that an art gene has passed the PDR's proposed
interactive human-approval boundary.

### 6.6 Lights and atmosphere

Lighting may be supplied explicitly or generated from deterministic defaults.
The current compiler can assemble:

- directional key lights;
- rim lights;
- ambient lights;
- point lights;
- and additional shader-packet lights.

Without an override, it supplies an upper-left key and subtle ambient light.

Atmosphere is carried as fog, bloom, and grading descriptions. Carrying a
field in VRI does not prove that the renderer executes it; the verified
renderer behavior is detailed in Section 7.

### 6.7 Raster escape hatch

`rasterPatches` preserve an explicit authored-pixel path. They are represented
as their own layers with blend mode, opacity, depth band, and source
provenance.

The escape hatch is visible in the scene rather than hidden inside a texture
or geometry heuristic.

### 6.8 Provenance and scene checksum

Compiler provenance records:

- compiler identity;
- source packet ID;
- geometry mode;
- gene and binding counts;
- shader ID;
- material and texture-layer counts;
- mark and raster-patch counts;
- and recorded geometry/palette intents.

The compiler serializes visible scene content—including coordinates, layer
payloads, lights, atmosphere, and canvas dimensions—then computes an
eight-character FNV-1a checksum.

This checksum is content-sensitive and deterministic. It is not the
cryptographic SHA-256 identity used by the construction contract.

---

## 7. Deterministic Rendering

### 7.1 Renderer contract

The renderer is a pure function:

```js
renderVRI(scene, scale)
  -> {
       width: scene.width * scale,
       height: scene.height * scale,
       data: Uint8Array
     }
```

The RGBA buffer begins as transparent black. Identical scene content and scale
produce identical output bytes.

### 7.2 Implemented pass order

The current renderer executes:

```text
1. geometry coverage and base color
2. texture fields
3. marks
4. lighting
5. fog and color grading
6. raster patches
```

The ordering is semantic. A raster patch is the final authored word, while
lighting and atmosphere affect the generated surface before that override.

### 7.3 Geometry coverage

Each logical geometry cell expands into a `scale × scale` output block.
Where signed distance and a surface normal are available, the renderer samples
subcell coverage and applies smooth antialiasing. Stroke half-width selects
band coverage; otherwise the signed distance describes filled coverage.

Cells outside the logical canvas are ignored.

### 7.4 Texture evaluation

Texture is deterministic multi-octave harmonic interference. Evaluation uses:

- frequency and cross-frequency;
- amplitude;
- direction;
- octave count;
- lacunarity and persistence;
- curvature modulation;
- and a distance envelope.

Object-space evaluation uses the cell tangent, normal, parametric position,
arc length, signed distance, and curvature when available. World, surface, and
screen spaces use their corresponding coordinate frames.

Texture is filtered by material when a material filter is present and is
applied only to non-transparent geometry.

### 7.5 Marks and blending

Marks are placed at rounded logical coordinates and expanded across the output
cell block. Their pressure controls alpha.

The implemented blend function handles:

- normal;
- multiply;
- screen;
- overlay;
- additive;
- and soft-light blending.

Opacity is applied after blend-mode evaluation.

### 7.6 Lighting

The renderer implements:

| Kind | Evaluation |
|---|---|
| Point | Gaussian-style distance falloff |
| Directional | Lambertian dot product against the cell normal |
| Rim | Fresnel-like grazing-angle emphasis |
| Ambient | Constant contribution |

Lights can target named materials through their `affects` list. Transparent
pixels are skipped.

### 7.7 Atmosphere

The verified atmosphere pass implements:

- vertical fog interpolation between declared near and far positions;
- contrast adjustment;
- saturation adjustment.

Although the scene schema and compiler can carry bloom data, the current
renderer does not execute a bloom pass.

### 7.8 Final raster patches

Raster-patch pixels use logical coordinates and fill the complete scaled cell
block. Fully opaque patches replace RGBA values. Partial-alpha patches blend
against the current buffer and raise output alpha as needed.

This last pass guarantees that explicitly authored pixel corrections are not
subsequently changed by procedural light or atmosphere.

---

## 8. Identity, Provenance, and Refusal

The pipeline uses different identity strengths at different boundaries.

| Boundary | Identity | What it establishes |
|---|---|---|
| Construction packet | Full canonical SHA-256 | Exact authored construction and solver-version identity |
| Construction result | Full canonical SHA-256 | Exact solved-part graph and measurements |
| VRI scene | Eight-character FNV-1a digest | Deterministic, content-sensitive render-scene identifier |
| RGBA output | Tested byte equality | Reproducible output for identical scene and scale |

These values are not interchangeable.

Construction exposes the stronger public refusal contract through
`PB-ERR-v1`. VRI compilation instead throws ordinary JavaScript `Error`
instances at explicit invalid scene-graph boundaries. The renderer assumes a
scene that conforms to the VRI shape and ignores out-of-canvas cells.

The important engineering rule is to preserve the boundary:

```text
constraint failure is not a visual warning;
it is refusal before rendering.
```

---

## 9. Human Authority and Ontological Context

The art-direction PDR defines a durable principle:

> The machine may validate, project, checksum, preview, warn, retrieve, and
> replay curated intent. It may not silently author or approve taste.

That principle explains why the current compiler accepts explicit art-gene
cells and declared binding effects rather than inferring an aesthetic from an
image or adjective.

The larger PDR also specifies separate gene, projection, and preview-document
identities; an interactive approval authority; an append-only memory ledger;
capability retrieval; and warn-only Feel evaluation. Those systems are
approved design context, not verified behavior of `compileVRI()` or
`renderVRI()`.

Current VRI callers remain responsible for supplying lawful, curated gene
inputs.

---

## 10. Operating Guidance

### 10.1 Choose the correct boundary

| Need | Use |
|---|---|
| Tangency, symmetry, containment, ratios, curvature, or connected assemblies | `construction_request` and `PB-GEOMETRY-CONSTRUCTION-v1` |
| Parts, coordinates, colors, and material identity | SCDL/PixelBrain asset packet |
| Grain, mark-making, lights, fog, grading, or explicit pixel overrides | VRI compiler options and art-gene inputs |
| Final deterministic pixels at a chosen integer scale | `renderVRI(scene, scale)` |

### 10.2 Technical-artist workflow

1. Author structure in SCDL or a canonical Wand construction request.
2. Use construction when relationships must be proved rather than eyeballed.
3. Treat a failed constraint or validation law as an authoring defect.
4. Compile accepted coordinates with material names and vector metadata intact.
5. Supply appearance through VRI inputs rather than baking it into unrelated
   geometry.
6. Use raster patches only when an explicit authored-pixel override is
   intentional.
7. Render at the required integer scale and verify the resulting bytes or
   approved visual artifact.

For isometric assets, repository law additionally requires exact SCDL canvas,
transparent silhouette, declared anchoring, and a consistent upper-left light
law. A rectangular 2D raster is not a lawful substitute for isometric source
geometry.

### 10.3 Engine-contributor checklist

- Preserve pure core boundaries.
- Do not add hidden randomness, clock input, or filesystem discovery.
- Keep construction and VRI identities distinct.
- Increment construction or render contract versions when semantics change.
- Do not silently lower an invalid scene graph to empty geometry.
- Do not treat a declared-but-unrendered schema field as shipped behavior.
- Add focused tests for every output-bearing parameter.
- Keep authored raster overrides explicit and last.

---

## 11. Current Limitations

| Limitation | Current consequence |
|---|---|
| Construction and VRI are separate composition boundaries | Callers must carry accepted coordinates into the asset packet; VRI does not invoke the solver |
| VRI checksum is 32-bit FNV-1a displayed as eight hex characters | It is deterministic and content-sensitive, but not a cryptographic content address |
| VRI constructors freeze outer records and selected arrays/payloads | Recursive immutability is not established for every nested caller object |
| Scene-graph lowering is not performed inside `compileVRI()` | The caller must provide non-empty `loweredCoordinates` |
| Bloom is carried but not rendered | Bloom data does not change current RGBA output through a dedicated bloom pass |
| Masks and composite layer kinds are declared but not generally executed | This paper does not claim general clipping/compositing support |
| `HARD_LIGHT` is declared by the schema but has no dedicated blend branch | This paper claims only the blend modes explicitly implemented by `applyBlend()` |
| Some gene channels record intent instead of applying appearance | Geometry and palette intents remain provenance metadata |
| Unknown gene binding channels are ignored | Forward compatibility takes precedence over strict binding refusal |
| VRI explicit refusals use ordinary `Error` objects | `PB-ERR-v1` coverage belongs to the construction boundary, not current VRI |
| Approval, ledger, retrieval, and Feel loop remain design context | Current VRI compilation does not prove human approval or durable art memory |

These are statements of the present implementation, not promises about future
scope.

---

## 12. Verification Record

Focused verification was executed on 2026-07-29 from the repository root.

### 12.1 VRI

Command:

```bash
npx vitest run tests/codex/core/pixelbrain/vixel/vri.test.js
```

Observed result:

```text
Test Files  1 passed (1)
Tests       64 passed (64)
```

The suite covers schema construction, compiler identity sensitivity,
scene-graph refusal, material texture creation, art-gene bindings, output
dimensions, alpha behavior, integer scales, and repeatable end-to-end
VRI-to-RGBA output.

### 12.2 Geometric construction

Command:

```bash
npx vitest run \
  tests/codex/core/pixelbrain/construction/construction-solver.test.js \
  tests/codex/core/pixelbrain/construction/crystal-stave-blade.test.js
```

Observed result:

```text
Test Files  2 passed (2)
Tests       122 passed (122)
```

The focused construction evidence covers the solver contract and the canonical
migrated crystal-stave asset. These focused results are not presented as a
repository-wide QA run.

---

## 13. Source and Contract Appendix

### 13.1 Primary sources

- [`2026-07-25-ontological-art-direction-pipeline-pdr-revised.md`](../PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md)
- [`2026-07-25-geometric-construction-solver-pdr.md`](../PDR-archive/2026-07-25-geometric-construction-solver-pdr.md)
- [`vri-compiler.js`](../../../codex/core/pixelbrain/vixel/vri-compiler.js)
- [`vri-renderer.js`](../../../codex/core/pixelbrain/vixel/vri-renderer.js)

### 13.2 Supporting implementation evidence

- [`vri-schema.js`](../../../codex/core/pixelbrain/vixel/vri-schema.js)
- [`vixel/index.js`](../../../codex/core/pixelbrain/vixel/index.js)
- [`vri.test.js`](../../../tests/codex/core/pixelbrain/vixel/vri.test.js)
- [`construction-solver.test.js`](../../../tests/codex/core/pixelbrain/construction/construction-solver.test.js)
- [`crystal-stave-blade.test.js`](../../../tests/codex/core/pixelbrain/construction/crystal-stave-blade.test.js)

### 13.3 Governing architectural statement

```text
SCDNA preserves supplied intent.
Construction proves relational geometry.
SCDL manifests structure.
VRI expresses appearance.
The renderer collapses appearance into deterministic pixels.
The human remains the authority for taste.
```

---

## Conclusion

The verified Scholomance asset pipeline is not a single generator. It is a
sequence of accountable transformations.

Construction proves what can be proved. SCDL carries what exists. VRI declares
how accepted structure should look. The renderer applies that declaration in a
fixed order and emits bytes.

That separation makes the pipeline reproducible without pretending that
determinism is aesthetic judgment. It gives technical artists a lawful place
to author relationships, materials, marks, and overrides. It gives engine
contributors testable interfaces. It gives stakeholders a clear answer to the
question behind every final pixel:

```text
Which intent produced it, which boundary accepted it,
and which deterministic pass made it visible?
```
