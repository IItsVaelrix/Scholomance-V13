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
- Opt-in palette quantization onto per-material anchor ramps, in luminance-band
  or nearest-anchor mode, with per-material ramp-coverage reporting.
- Compile-time reporting of declared-but-unexecuted scene features through
  `RENDERER_CAPABILITIES` and `provenance.unrenderedDeclarations`.
- A locked reference render: a fixed fixture whose exact RGBA bytes are
  asserted against a stored digest, so a renderer change that alters output
  fails rather than passing a self-consistency check.

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

Serialization sorts object keys recursively and preserves array order, so the
digest is a function of content rather than of the order in which a caller
happened to assemble a record. Layer payloads are serialized whole rather than
hand-projected onto a field list; a coordinate field added later is covered by
the digest on the day it is added.

This matters because a projection is a promise that has to be maintained. An
earlier implementation reduced each geometry coordinate to
`{x, y, color, material, signedDistance}`. The renderer also reads `normal`,
`tangent`, `curvature`, `t`, `arcLength`, `strokeHalfWidth`, and `snappedX/Y`.
Scenes differing only in those fields therefore produced identical checksums
and different pixels — `snappedX` alone relocates a sprite. The regression
suite now varies each of those fields individually and asserts both that the
render changes and that the checksum changes.

This checksum is content-sensitive and deterministic. It is not the
cryptographic SHA-256 identity used by the construction contract.

### 6.9 Unrendered-declaration reporting

The VRI schema is deliberately wider than the renderer. That is defensible for
forward compatibility and for downstream consumers, but a carried-but-inert
field must not be indistinguishable from a working one: an author who sets
bloom and sees no change cannot otherwise tell a wrong value from an
unimplemented pass.

`vri-renderer.js` therefore exports `RENDERER_CAPABILITIES`, a manifest of the
layer types, blend modes, light kinds, atmosphere passes, and texture spaces
that are actually executed, plus the payload fields that are never read. The
compiler diffs each scene against that manifest and records the result in
`provenance.unrenderedDeclarations`, alongside `provenance.rendererVersion`.

Each entry carries a `field`, its `value`, and a `reason`. Reporting is never
a refusal — compilation succeeds and the scene is unchanged. An over-declared
scene reports, for example:

```text
geometry.aaWidth = 0.7
    edge softness is derived from output scale; authored aaWidth is not read
atmosphere.bloom = true
    the renderer executes no bloom pass; the data is carried but never applied
gene.binding.operation = "lighting:decrease-key"
    no compiler branch implements this operation
gene.binding.recordedOnly = "palette"
    recorded into provenance as intent; it does not alter the scene
gene.binding.channel = "sparkle"
    unknown binding channel; ignored for forward compatibility
```

The manifest is the single source of truth. A contributor who adds a pass must
add its capability in the same commit, or the compiler will keep reporting a
shipped feature as inert.

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
6. palette quantization
7. raster patches
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

Lights can target named materials through their `affects` list. An empty list
means every cell; a non-empty list is an allow-list, and a cell carrying no
material at all is not on it. Transparent pixels are skipped.

`FOG` and `BLOOM` appear in `LIGHT_KINDS` but are not illumination. The
lighting pass skips them rather than letting them reach a default branch,
which previously applied a flat `intensity × 0.5` colour wash to every lit
cell.

### 7.7 Atmosphere

The verified atmosphere pass implements:

- vertical fog interpolation between declared near and far positions;
- contrast adjustment;
- saturation adjustment.

Although the scene schema and compiler can carry bloom data, the current
renderer does not execute a bloom pass.

### 7.8 Palette quantization

Every generative pass computes in continuous RGB: lighting adds, grading
multiplies, texture modulates. A nine-colour authored sprite therefore left the
renderer carrying hundreds of colours, and the count grew with output scale, so
the same asset had no stable colour identity across sizes.

The quantization pass snaps each covered pixel to the nearest colour on its
material's authored anchor ramp, by luma-weighted RGB distance. On the
`celestial-sword` fixture:

| | 1× | 4× | 8× |
|---|---|---|---|
| `quantize: false` | 308 colours | 864 | 1192 |
| `quantize: true` | 45 | 45 | 45 |

The stability matters as much as the reduction. A ramp has no notion of
resolution, so rendering larger can no longer invent colour.

Three placement decisions carry the design:

- It runs **after** every generative pass. Quantizing earlier is undone by
  whatever runs next.
- It runs **before** raster patches, so curated pixels — authored patches and
  gene coordinates alike — are never re-coloured by a machine pass. This is the
  human-authority principle expressed in pass order.
- The **compiler** resolves ramps from the material registry and bakes them into
  the scene. The renderer never imports the registry, so rendering stays a pure
  function of the scene it is handed, and a caller may supply its own ramps
  instead.

Selection is nearest-anchor rather than positional index. `qbit-phosphorylation`
indexes `Object.values(material.anchors)` by SDF depth, treating anchor order as
the energy ramp — rim to core, `void` to `whiteCore`. That ordering is a registry
convention rather than a validated contract: of 68 materials carrying anchors, 62
are monotonic dark-to-bright and six are not, split between deliberately emissive
ramps whose bright anchors are less luminant and genuine `deep`/`body`
inversions. Nearest-anchor never assumes position implies brightness, so a
mis-ordered ramp yields a wrong-index colour rather than an inverted gradient.

Quantization is **opt-in** (`compileVRI(packet, { quantize: true })`). Enabling
it by default would rewrite every existing asset's checksum and pixels in one
step, and in this pipeline the checksum is identity. Flip the default once the
corpus below is reconciled.

#### 7.8.1 Selection mode: the material carries the colour

Quantization has two modes, and the choice is a statement about what an authored
hex *means*.

`luminance-band` (the default) treats the authored hex as a **value sketch**: it
maps a pixel's luminance onto ramp position over the absolute [0,1] range, and
the material supplies the hue. This is what makes a material name carry colour
intent — swapping `material crystal` for `material ruby` recolours a part while
preserving its form. It mirrors the registry's own `transmuteMaterialColor`,
which has always been luminance-driven.

`nearest-anchor` snaps to the nearest ramp colour by luma-weighted RGB distance,
preserving authored hue. It is the wrong mode when the material is meant to
*supply* hue. Snapping cyan onto a ruby ramp sends three distinct authored values
— `#00E5FF`, `#FFFFFF`, `#80F5FF` — all to the same anchor `#FFF0F5`, because
every ruby anchor is far from cyan and the near-white is merely least far. Blade,
spine and pommel collapse to one colour and the form is destroyed. Under
`luminance-band` the same three map to `#F4639B`, `#FFF0F5`, `#FBB6D0` — hue
changes, structure survives.

Mapping is deliberately **not** normalised against the ramp's own luminance span.
That looks equivalent for a wide ramp (`sapphire` spans 0.02–0.96) but collapses a
narrow one: every pixel brighter than 0.15 would land on `abyss`'s top anchor. The
absolute mapping means a value sketch distributes across whatever ramp it is
given, so an abyss-material object renders dark but still legible.

Verified against a real asset. `holy_fire_claymore.pbrain` (64×112, 788 coords,
39 colours) carries **no material data at all** — it predates material semantics.
Assigning materials per part and rendering under `luminance-band`:

| morph | materials | colours |
|---|---|---|
| original | none | 39 |
| void-ice | sapphire blade, voidsteel hilt, amethyst pommel | 13 |
| ruby | ruby blade, darksteel guard, leather grip, gold pommel | 16 |
| emerald | emerald blade, bronze guard, oak_bark grip, moonstone pommel | 15 |

Every rim highlight, the crossguard, and the grip ridges survive each morph. Only
hue moves. This reproduces the operation `sprite.void_ice_claymore.v1` documents
as "a luminance-ramp morph of holy_fire_claymore."

#### 7.8.2 Palette coverage

A material swap can only express what the value sketch gives it room to express.
`provenance.paletteCoverage` reports, per material, how many distinct ramp anchors
the authored colours reach, with the luminance span they cover.

A part reaching **one** anchor is flagged `flat`: every material renders it as a
single block, so no morph can do anything but recolour it. That needs no tuned
threshold — one anchor used means the ramp is doing no work. Across shrine-demo,
`lightning-sword` is 1/7 on all six of its materials with span 0.00, while
`moonlit-shrine-forest` reaches 4/7 and 5/7 with spans of 0.98 and 0.76.

This replaces an earlier "palette drift" metric that measured RGB distance from an
authored colour to its material's ramp, and reported `holy_steel` painted gold as
a defect. Under value-sketch semantics that is not a defect: gold is luminance
0.70, landing on holy_steel's upper anchor exactly as designed. The metric was
measuring hue divergence in a system that discards hue on purpose.

### 7.9 Final raster patches

Raster-patch pixels are snapped to the logical cell grid and fill the complete
scaled cell block. Fully opaque patches replace RGBA values. Partial-alpha
patches blend against the current buffer and raise output alpha as needed.

Snapping is load-bearing. An unrounded logical coordinate scales to a
fractional buffer index, and a fractional index on a `Uint8Array` writes
nowhere: a patch at `x = 3.1` disappeared entirely at 4×, while `x = 3.5`
painted a partial block whose size depended on the output scale. The mark pass
has always rounded; the raster pass now agrees with it.

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
- When adding a renderer pass, add its capability to `RENDERER_CAPABILITIES`
  in the same commit, or the compiler will keep reporting a shipped feature as
  inert.
- Do not hand-project scene content for the checksum. Serialize payloads whole,
  so a new field is covered the day it is added rather than the day someone
  remembers to extend the projection.
- Add focused tests for every output-bearing parameter, and guard each one by
  first asserting the parameter actually moves pixels — a test that only checks
  the compiler wrote a field proves nothing about the render.
- Keep authored raster overrides explicit and last.

---

## 11. Current Limitations

Every limitation marked *reported* is surfaced at compile time in
`provenance.unrenderedDeclarations` (§6.9). The remainder are structural and
carry no automatic diagnostic.

| Limitation | Current consequence |
|---|---|
| Construction and VRI are separate composition boundaries | Callers must carry accepted coordinates into the asset packet; VRI does not invoke the solver, and no identity links a solved construction to the scene compiled from it |
| VRI checksum is 32-bit FNV-1a displayed as eight hex characters | It is deterministic and content-sensitive, but not a cryptographic content address; treat it as a cache key, not a content address |
| VRI constructors freeze outer records and selected arrays/payloads | Recursive immutability is not established for every nested caller object; the gene-binding pass rebuilds modified layers as unfrozen objects |
| Scene-graph lowering is not performed inside `compileVRI()` | The caller must provide non-empty `loweredCoordinates` |
| Bloom is carried but not rendered — *reported* | Bloom data does not change current RGBA output through a dedicated bloom pass |
| Masks and composite layer kinds are declared but not generally executed — *reported* | This paper does not claim general clipping/compositing support; a `maskRef` is carried into the scene and ignored |
| `HARD_LIGHT` is declared by the schema but has no dedicated blend branch — *reported* | This paper claims only the blend modes explicitly implemented by `applyBlend()`; an unimplemented mode silently behaves as `NORMAL` |
| `depthBand` is declared as z-order but never sorted on — *reported* | Layers render in array order; a `depthBand` that disagrees with array order is decoration |
| `aaWidth`, `coverageMode`, `partFilter`, `ditherMatrix`, `strokeWidth`, per-mark `width` and `kind`, and `light.angle` are accepted but never read — *reported* | They are carried through the scene and the checksum, and reach no pass |
| Some gene channels record intent instead of applying appearance — *reported* | Geometry and palette intents remain provenance metadata |
| Unknown gene binding channels are ignored — *reported* | Forward compatibility takes precedence over strict binding refusal, but the ignored channel is named rather than dropped in silence |
| VRI explicit refusals use ordinary `Error` objects | `PB-ERR-v1` coverage belongs to the construction boundary, not current VRI |
| The construction suite locks no reference geometry | The VRI suite now pins one reference render (§12.1), but the construction tests assert `passed === true` and replay self-consistency; a solver change that moves every coordinate would still pass |
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
Tests      114 passed (114)
```

The suite covers schema construction, compiler identity sensitivity,
scene-graph refusal, material texture creation, art-gene bindings, output
dimensions, alpha behavior, integer scales, and repeatable end-to-end
VRI-to-RGBA output.

Fifty of those tests were added on 2026-07-29 to lock behavior that was
previously unasserted:

- a locked reference render: one frozen fixture exercising every implemented
  pass, whose scene checksum and exact RGBA bytes at 1×, 2×, 4×, and 8× are
  asserted against stored SHA-256 digests. Its ability to fail was confirmed
  by mutation — changing the texture modulation constant from 35 to 36 turns
  the 2×, 4×, and 8× assertions red;

- per-field checksum coverage for `normal`, `tangent`, `curvature`, `t`,
  `arcLength`, `strokeHalfWidth`, `snappedX`, `snappedY`, and geometry-layer
  `aaWidth`, each guarded by first asserting the field moves pixels;
- checksum insensitivity to caller key insertion order;
- `light.affects` as a strict allow-list, including cells with no material;
- raster-patch snapping at fractional coordinates and across scales;
- non-illuminating light kinds contributing nothing;
- unrendered-declaration reporting for bloom, unexecuted blend modes,
  ignored masks, unknown gene channels, and recorded-only bindings;
- palette quantization: ramp resolution, colour-count collapse, scale
  stability, ramp-membership of every emitted colour, passthrough and unknown
  materials left alone, authored patches and curated gene coordinates exempt
  from re-colouring, caller-supplied ramps, and drift reporting.

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

### 12.3 Known stale duplicate

`tests/pixelbrain/crystal-stave-blade.test.js` is an obsolete copy of the
canonical construction test above. It asserts the retired `scd64:<8 hex>`
checksum format and a spec variant that fails `connected-assembly`, so it
fails on `master` and is invisible to the commands in §12.2, which only run
the `tests/codex/...` path. It should be deleted rather than repaired; the
`tests/codex/core/pixelbrain/construction/` copy is authoritative.

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
