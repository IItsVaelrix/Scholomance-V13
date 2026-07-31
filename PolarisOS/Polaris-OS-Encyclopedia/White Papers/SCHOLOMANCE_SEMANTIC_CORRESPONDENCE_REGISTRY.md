# Scholomance Semantic Correspondence Registry

**Version:** 1.0.0
**Date:** 2026-07-30
**Status:** Living document. Entries are added or reclassified as the codebase evolves.
**Audience:** Any AI agent, human engineer, or external system that needs to map
machine-learning / computer-science vocabulary onto the Scholomance codebase.
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-WP-SEMANTIC-CORRESPONDENCE-REGISTRY`

---

## 0. Purpose and Scope

This registry maps external ML/CS terminology to the Scholomance codebase's own
vocabulary. It exists because the codebase and the broader ML/CS community
frequently describe **the same structures using different words**, and because
some apparent correspondences are **false friends** that mislead.

### What this document IS

- A lookup table. An agent reads one entry and knows what the codebase calls
  the thing it already understands, how strong the mapping is, and where the
  evidence lives.
- A falsification record. Every entry states what is **not** preserved. If a
  mapping is weak, this document says so.
- A grounding source for the Concept Chemistry Lab
  (`codex/core/pixelbrain/concept-chemistry.js`). Once ingested into the
  substrate, these entries provide corpus attestation for reactions that use
  ML vocabulary.

### What this document is NOT

- A proof system. No entry here constitutes a mathematical proof of equivalence.
- An ontology. This document does not assert that Scholomance *is* a molecular
  graph, a tensor network, or any other external formalism. It records
  **correspondences** of graded strength.
- A design specification. Nothing here prescribes what to build. It describes
  what exists.

---

## 1. Strength Taxonomy

Every correspondence is classified into exactly one of five strength levels.
These levels are **ordered** and **mutually exclusive**.

| Level | Code | Definition | Bidirectional? | Use in engineering |
|-------|------|------------|----------------|--------------------|
| **Identity** | `ID` | Same mathematical object, different name. No information loss in either direction. | Yes, trivially | Substitute freely. |
| **Structural Correspondence** | `SC` | A faithful mapping that preserves the relevant structure in both directions. Not the same object, but the mapping is injective and structure-preserving on the properties that matter. | Yes, with documented caveats | Reason by analogy with confidence. Verify at boundaries. |
| **Functional Analogy** | `FA` | Similar role, different mechanism. Useful for intuition and teaching. The mapping does **not** preserve structure and may break under stress. | Partial or no | Use for explanation. Do not use for proof or code generation. |
| **Metaphor** | `MT` | Intuition pump. No structural preservation. Useful for communication with non-specialists. Actively dangerous if treated as engineering guidance. | No | Use in prose. Never in code. |
| **False Friend** | `FF` | Looks like a match. Isn't. Documented here specifically to **prevent** misuse. | No | Do not use. Cite this entry when someone proposes the mapping. |

### Reclassification rule

An entry may be **promoted** (e.g. FA → SC) only when a concrete, tested
implementation demonstrates the structural preservation. An entry may be
**demoted** at any time a counterexample is found. The default for new
proposed mappings is `FA` until evidence supports promotion.

---

## 2. Correspondence Entries

Each entry follows this schema:

```
### SCR-NNN: <External Term> ↔ <Scholomance Term>
- Strength:        ID | SC | FA | MT | FF
- Preserved:       What the mapping preserves.
- NOT preserved:   What the mapping does NOT preserve. (Required. No exceptions.)
- Math:            The actual mathematical structure underneath.
- Directionality:  Does the mapping work A→B, B→A, or both?
- Evidence:        File paths, test counts, specific code.
- Notes:           Caveats, history, reclassification record.
```

---

### SCR-001: Dense latent vector embedding ↔ Substrate 4-bit quantized vectors

- **Strength:** `ID`
- **Preserved:** Vector space membership. Cosine similarity as a metric.
  Nearest-neighbor retrieval. Dimensionality (fixed DIM). The fundamental
  operation — "represent a concept as a point in a metric space and compare
  by distance" — is identical.
- **NOT preserved:** Precision. The substrate quantizes to 4 bits per
  dimension. Fine-grained distinctions that a float32 embedding would
  separate may collapse. The substrate is also seeded from a fixed corpus,
  so its coverage is bounded by what has been ingested.
- **Math:** Both are maps f: X → ℝ^d (or ℤ^d for quantized) with a cosine
  metric. The quantization is a lossy projection π: ℝ^d → {0..15}^d.
  The metric structure survives π approximately.
- **Directionality:** Both directions. A substrate vector IS an embedding.
  An external embedding could be ingested into the substrate with
  quantization loss.
- **Evidence:** `codex/core/pixelbrain/concept-chemistry.js` (DIM=512,
  sha256 feature-hashing). Substrate engine: `~/.substrate/memory.sqlite`,
  4-bit quantized vectors. 13 concept-chemistry tests.
- **Notes:** The concept-chemistry module uses sha256 feature-hashing rather
  than a learned model. This makes it MORE deterministic (no model drift)
  but LESS semantically nuanced (no synonymy beyond shared subwords). The
  identity holds at the structural level: both are fixed-dimensional vectors
  compared by cosine. The quality difference is in the embedding function,
  not the representation.

---

### SCR-002: Content-addressed hash ↔ Checksum (sha256, fnv1a, SCD64)

- **Strength:** `ID`
- **Preserved:** Deterministic mapping from content to fixed-length digest.
  Collision resistance (sha256). Identity verification. Change detection.
- **NOT preserved:** Nothing relevant is lost. This is the same object.
- **Math:** H: {0,1}* → {0,1}^n. For sha256, n=256. For fnv1a, n=32.
  For SCD64, n=64 with structured bit-fields encoding bug family and
  remediation hints.
- **Directionality:** Trivially both. A checksum IS a content-addressed hash.
- **Evidence:** `codex/core/pixelbrain/sha256.js`. `vri-compiler.js`
  `canonicalSceneJSON()` + sha256. `construction-schema.js`
  `canonicalConstructionStringify()` + sha256. `scd64/` directory.
  100-iteration determinism proofs in construction and VRI test suites.
- **Notes:** SCD64 is a structured checksum — specific bit ranges encode
  semantic information (bug family, severity). This makes it richer than
  a plain hash but does not change the fundamental identity.

---

### SCR-003: Rasterization ↔ Scanline fill / VRI raster pass

- **Strength:** `ID`
- **Preserved:** The algorithm. Converting geometric descriptions (contours,
  polygons) into pixel grids. Even-odd fill rule. Bounds clipping.
- **NOT preserved:** Nothing. This is the same algorithm.
- **Math:** Given a closed contour C = [(x₁,y₁), ..., (xₙ,yₙ)] and a pixel
  grid G = [0,W) × [0,H), the scanline fill computes
  { (x,y) ∈ G : winding(x,y,C) is odd }.
- **Directionality:** Trivially both.
- **Evidence:** `codex/core/pixelbrain/construction-to-coords.js`
  `scanlineFill()`. `vixel/vri-renderer.js` geometry pass. 5 scanline
  tests in compile-asset suite.
- **Notes:** The VRI renderer's geometry pass is a more sophisticated
  rasterizer (SDF-backed, anti-aliased) but the fundamental operation
  is identical.

---

### SCR-004: Reference frames / coordinate spaces ↔ VRI coordinateSpace

- **Strength:** `ID`
- **Preserved:** The concept of expressing coordinates relative to different
  origins: object-local, world-global, screen-projected, surface-aligned.
  Transform composition. The distinction between "where is this point
  relative to the object" vs "where is it on the canvas."
- **NOT preserved:** Nothing. This is standard graphics terminology applied
  directly.
- **Math:** A coordinate space is a frame F = (origin, basis). Points are
  expressed as p_F = F⁻¹ · p_world. Transforms compose: F_screen =
  F_proj · F_view · F_model.
- **Directionality:** Trivially both.
- **Evidence:** `vixel/vri-schema.js` `coordinateSpace` field with values
  `object | world | surface | screen`. `vri-renderer.js` 4-way texture
  dispatch per space. 5 texture-space tests.
- **Notes:** Added specifically to fix the "wallpaper texture" bug where
  bark grain was canvas-space instead of object-space. The fix required
  making the reference frame explicit — which is exactly what graphics
  engines call coordinate spaces.

---

### SCR-005: Monotonic clock / Lamport timestamps ↔ Revision monotonicity gate

- **Strength:** `ID`
- **Preserved:** The invariant that sequence numbers never decrease. Stale
  messages are dropped. The ordering is total and consistent across
  consumers.
- **NOT preserved:** Nothing. The Defold bridge's revision gate IS a
  Lamport-style monotonic sequence check.
- **Math:** A monotonic sequence s₁ ≤ s₂ ≤ ... ≤ sₙ where each consumer
  tracks last_seen and rejects any sᵢ < last_seen.
- **Directionality:** Trivially both.
- **Evidence:** `PolarisOS/apps/defold-runtime/scenepacket/packet.lua`
  `passes_revision_gate()`. `PolarisOS/packages/scene-packet/src/verifySeal.ts`
  `passesRevisionGate()`. 18 Lua tests + 12 TS seal tests.
- **Notes:** The implementation uses `roomRevision` + `sequence` as a
  two-level monotonic key, which is slightly richer than a single Lamport
  clock but the principle is identical.

---

### SCR-006: Graceful degradation / progressive enhancement ↔ Degradation ladder

- **Strength:** `ID`
- **Preserved:** The ordered fallback chain. Each rung provides a complete
  (if lower-fidelity) experience. The system never crashes on missing
  assets; it degrades to the next available representation.
- **NOT preserved:** Nothing. This is the same design pattern.
- **Math:** A total order on representation fidelity:
  SPRITE > ATLAS_REGION > GLYPH > PLACEHOLDER. The renderer selects
  max{ r ∈ rungs : r is available }.
- **Directionality:** Trivially both.
- **Evidence:** `PolarisOS/apps/defold-runtime/scenepacket/render.lua`
  degradation ladder. White paper §6.
- **Notes:** Standard web/mobile pattern applied to game rendering.

---

### SCR-007: Constraint infeasibility / deterministic refusal ↔ Solver refusal

- **Strength:** `ID`
- **Preserved:** The behavior: when constraints cannot be simultaneously
  satisfied, the system refuses with a structured diagnostic rather than
  producing a partial or approximate result. The refusal is deterministic
  and reproducible.
- **NOT preserved:** Nothing. This is the same concept from optimization
  theory applied to geometric construction.
- **Math:** Given constraint set C, if ∄ assignment a such that
  ∀c ∈ C: satisfied(c, a), then refuse(C) → {failingConstraint, reason}.
- **Directionality:** Trivially both.
- **Evidence:** `construction/solver-orchestrator.js` `solve()` throws
  `constructionError` on infeasible constraints. `construction-error.js`.
  64 construction tests including explicit infeasibility cases.
- **Notes:** The PDR (§1 risk mitigation) specifically requires this:
  "Never silent degradation. Never partial solving."

---

### SCR-008: Attributed molecular graph ↔ Scene graph + construction constraint graph

- **Strength:** `SC`
- **Preserved:** Graph structure. Nodes (parts/atoms) with typed labels
  (material/element). Edges (constraints/bonds) with typed labels
  (coaxial/covalent). Topology. The operations of traversal, subgraph
  extraction, and topological sorting apply identically.
- **NOT preserved:** Chemical semantics. Valence rules, orbital hybridization,
  reaction energetics, stereochemistry. The construction graph has no
  analogue of electron configuration. Also: molecular graphs typically
  have small, fixed node types (C, H, O, N...) while construction graphs
  have open-ended part types. The graph IS attributed; it is NOT molecular.
- **Math:** Both are typed attributed graphs G = (V, E, λ_V, λ_E, X_V)
  where λ_V: V → Type, λ_E: E → ConstraintKind, X_V: V → Features
  (coordinates, material, color). The construction solver performs
  topological sort on G and applies constraints in dependency order —
  exactly as a molecular mechanics solver would.
- **Directionality:** Both directions for the graph structure. A→B: every
  construction graph can be represented as an attributed graph. B→A: not
  every attributed graph is a valid construction (must satisfy closure,
  winding, curvature laws). The mapping is injective A→B but not
  surjective B→A.
- **Evidence:** `construction/solver-orchestrator.js` topological sort.
  `construction/constraint-solver.js` 15 constraint kinds.
  `construction/constructors/` 11 geometric constructors.
  `scdl/graph-walk.js`. 64 construction tests.
- **Notes:** This is the strongest non-identity correspondence in the
  registry. The construction solver IS a graph-based constraint system.
  Calling it "molecular" adds chemical connotations that don't apply,
  but the graph-theoretic structure is faithfully preserved.

---

### SCR-009: Labeled graph operations ↔ SCDL typed operations

- **Strength:** `SC`
- **Preserved:** Typed nodes with attributes. Declarative specification
  (what, not how). Composability (operations combine into scenes).
  Deterministic evaluation (same spec → same output).
- **NOT preserved:** Turing completeness. SCDL is not a programming
  language. It has no loops, no conditionals, no recursion. It is a
  declarative scene description format. Also: SCDL operations are
  specifically geometric (polygon, ellipse, ribbon, capsule) while
  general labeled graph operations are domain-agnostic.
- **Math:** SCDL is a typed term algebra. An SCDL program is a tree of
  typed constructors: Asset → Part → Op(polygon | ellipse | ...).
  Evaluation is a homomorphism from the term algebra to the coordinate
  algebra: ⟦·⟧: Term → [Coord]. This is structure-preserving: the
  tree structure of the SCDL source is reflected in the grouping of
  output coordinates.
- **Directionality:** A→B (SCDL → labeled graph): faithful. Every SCDL
  program is a labeled tree. B→A (labeled graph → SCDL): only for
  graphs whose node types are in the SCDL type set and whose structure
  is a tree (not a general DAG).
- **Evidence:** `scdl/scdl.grammar.js` (36 KB grammar). `scdl/scdl.compiler.js`
  pass pipeline: validate → resolveColors → resolveMaterials → expandVector
  → expandSymmetry → expandCells → projectGenes → emitPacket. 210 SCDL tests.
- **Notes:** The pass pipeline is a sequence of tree-to-tree transformations,
  which is exactly how attribute grammars and term rewriting systems work.
  This correspondence is strong enough to reason about formally.

---

### SCR-010: Constraint Satisfaction Problem (CSP) ↔ Construction solver

- **Strength:** `SC`
- **Preserved:** Variables (parts). Domains (positions in canvas).
  Constraints (coaxial, tangent, coincident, symmetric, contained, ratio,
  distance, curvature, taper). The solving strategy: topological ordering
  followed by sequential constraint application with verification.
  Infeasibility detection and refusal.
- **NOT preserved:** General CSP techniques: backtracking, arc consistency,
  constraint propagation. The construction solver is a **greedy sequential
  solver**, not a general CSP solver. It applies constraints in a fixed
  topological order and verifies after each pass. It does not backtrack.
  This means it may refuse instances that a backtracking solver could
  satisfy. This is by design (determinism over completeness).
- **Math:** CSP = (X, D, C) where X = {part₁, ..., partₙ}, D = canvas
  positions, C = {coaxial, tangent, ...}. The solver computes a
  homomorphism h: X → D such that ∀c ∈ C: c(h) holds, or refuses.
  The fixed ordering makes this O(n·|C|) rather than exponential,
  at the cost of completeness.
- **Directionality:** A→B: the construction solver IS a CSP solver
  (restricted). B→A: not every CSP is a geometric construction.
- **Evidence:** `construction/constraint-solver.js` (427 lines, 15
  constraint kinds). `construction/solver-orchestrator.js` topological
  sort + sequential application. `construction/validation-laws.js`
  5 post-solve validation laws. 64 tests.
- **Notes:** The restriction to greedy sequential solving is a deliberate
  engineering trade-off: determinism and speed over completeness. The
  PDR (§3) specifies the fixed constraint ordering: coaxial → coincident
  → tangent → symmetric → contained → ratio → distance → curvature → taper.

---

### SCR-011: Dependency DAG / reaction ordering ↔ Topological sort of construction

- **Strength:** `ID`
- **Preserved:** The algorithm. Kahn's algorithm or DFS-based topological
  sort on a directed acyclic graph. Parts that reference other parts
  (e.g., "bowl tangent to rim") create edges. The sort determines
  evaluation order.
- **NOT preserved:** Nothing. This is the same algorithm.
- **Math:** Given DAG G = (V, E), topological sort produces an ordering
  v₁, ..., vₙ such that ∀(vᵢ, vⱼ) ∈ E: i < j.
- **Directionality:** Trivially both.
- **Evidence:** `construction/solver-orchestrator.js` topological sort
  of parts by dependency. `scdl/graph-walk.js`.
- **Notes:** Cycle detection is included. A cyclic construction refuses
  with a diagnostic.

---

### SCR-012: Hard constraints / guardrails ↔ Law gates

- **Strength:** `SC`
- **Preserved:** Boolean predicates that zero out infeasible states.
  Non-negotiable. Not soft penalties. A law gate violation forces
  feasibility to exactly 0, regardless of all other scores.
- **NOT preserved:** Graduated response. Real-world guardrails often have
  tolerance ranges, warning zones, or soft boundaries. Law gates are
  binary: pass or refuse. Also: law gates in the concept chemistry lab
  are keyword-based (string matching on "random", "unseeded", etc.),
  which is a crude approximation of true constraint checking.
- **Math:** gate: Concept → {0, 0.7, 1.0}. If ∃ keyword ∈ LAW_BAD ∩
  tokens(concept): gate = 0. Elif ∃ keyword ∈ LAW_GOOD ∩ tokens(concept):
  gate = 1. Else: gate = 0.7. The feasibility score is multiplied by
  the gate value.
- **Directionality:** A→B: law gates are a specific instance of hard
  constraints. B→A: not every hard constraint is keyword-based.
- **Evidence:** `concept-chemistry.js` `lawGate()`. LAW_BAD and LAW_GOOD
  keyword sets. `construction/validation-laws.js` 5 geometric validation
  laws. Vaelrix Law (19 global laws).
- **Notes:** The keyword-based implementation is acknowledged as crude.
  A future version could use the substrate to check whether a proposed
  concept co-occurs with known law violations.

---

### SCR-013: Canonical serialization + integrity tag ↔ Sealed packet

- **Strength:** `SC`
- **Preserved:** Canonical form (deterministic serialization with sorted
  keys). Integrity verification (sha256 over canonical form). Tamper
  detection. Version binding. The sealed packet IS a canonically
  serialized message with an integrity tag.
- **NOT preserved:** Cryptographic authentication. A seal proves integrity
  (the content hasn't changed) but not authenticity (who produced it).
  There is no signature key, no certificate chain. Also: "sealed packet"
  carries world-building connotations (wax seals, institutional authority)
  that have no cryptographic analogue.
- **Math:** seal = sha256(canonicalJSON(packet)). Verification:
  recompute seal' = sha256(canonicalJSON(received_packet));
  accept iff seal' === seal. This is a MAC without a key — a hash-based
  integrity check, not an HMAC.
- **Directionality:** A→B: a sealed packet is a specific instance of
  canonical serialization + integrity tagging. B→A: not every canonical
  serialization is a sealed packet (must also satisfy the SceneManifest
  schema, carry plan1: prefix, etc.).
- **Evidence:** `PolarisOS/packages/scene-packet/src/seal.ts`
  `computePlanSeal()`. `buildSealedPacket.ts`. `verifySeal.ts`.
  `canonicalJson()`. 27 seal/receipt tests. Defold bridge 4 rules.
- **Notes:** The `plan1:` prefix is a version tag, analogous to a codec
  identifier in a container format. The seal family includes `pb1:`,
  `pbr1:`, `png1:`, `render1:` — each a different canonical form with
  its own hash.

---

### SCR-014: Serialization protocol / IDL ↔ Wire format (toLuaWire)

- **Strength:** `SC`
- **Preserved:** Explicit schema. No ambiguous types (null eliminated,
  arrays carry explicit counts). Cross-language safety (TypeScript →
  Lua). Versioned format. The wire format IS a serialization protocol.
- **NOT preserved:** Schema evolution. Protocol buffers and Cap'n Proto
  have field numbering, default values, and backward/forward
  compatibility rules. The wire format is a single-version projection
  with no migration path. Also: no binary encoding — it's JSON text.
- **Math:** A projection π: Packet → WirePacket where π eliminates nulls
  (→ ""), flattens nested arrays (glyphs → scalars), and adds explicit
  count fields (sprites → sprites + spriteCount). π is injective: the
  original packet is recoverable from the wire format.
- **Directionality:** A→B: the wire format is a specific serialization
  protocol. B→A: not every serialization protocol has the no-null,
  explicit-count constraints.
- **Evidence:** `PolarisOS/packages/defold-bridge/src/wire.ts` `toLuaWire()`.
  12 wire tests. `apps/defold-runtime/scenepacket/packet.lua` decoder.
  18 Lua tests.
- **Notes:** The no-null invariant exists because Lua conflates absent
  keys and nil values. The explicit count invariant exists because Lua
  tables don't distinguish empty arrays from empty objects. These are
  Lua-specific accommodations, not general protocol design.

---

### SCR-015: Semantic tensor decomposition ↔ VRI 7-pass renderer

- **Strength:** `FA`
- **Preserved:** The intuition that complex visual output is composed from
  independent layers of meaning: geometry, texture, marks, lighting,
  atmosphere, compositing, raster. Each pass adds information. The
  passes interact (lighting reads geometry normals, atmosphere reads
  depth).
- **NOT preserved:** Tensor algebra. A tensor decomposition (CP, Tucker,
  Tensor Train) is a factorization of a multi-dimensional array into
  low-rank components. The VRI passes are **sequential function
  compositions**, not parallel factorizations. Pass order matters
  (geometry before lighting before atmosphere). Tensor contractions
  are commutative over independent modes; VRI passes are not.
  The passes share a framebuffer (mutable state); tensor modes are
  independent axes.
- **Math:** VRI: output = raster ∘ composite ∘ atmosphere ∘ light ∘
  marks ∘ texture ∘ geometry. This is function composition (f ∘ g),
  not tensor contraction (T ×ₙ U). The analogy holds at the level of
  "multiple independent contributions combine" but breaks at the level
  of algebraic structure.
- **Directionality:** A→B: plausible as an intuition pump. B→A: you
  cannot implement a VRI renderer as a tensor decomposition without
  fundamentally changing the algorithm.
- **Evidence:** `vixel/vri-renderer.js` 7-pass architecture (33 KB).
  `vixel/vri-schema.js` 7 LAYER_TYPES. 64 VRI tests.
- **Notes:** This is the mapping most likely to be **promoted** in the
  future. If the passes were reformulated as independent modes of a
  tensor (geometry × texture × light × atmosphere) with a learned or
  deterministic contraction, the analogy would become structural. As
  implemented, it is a functional analogy: the passes DO compose
  layers of visual meaning, but the algebra is sequential composition,
  not tensor contraction.

---

### SCR-016: Context matrices / attention ↔ Gene binding channels

- **Strength:** `FA`
- **Preserved:** The intuition that contextual information modulates
  output. Genes carry binding instructions that modify render channels
  (geometry, contour, lighting, atmosphere, palette, texture, density)
  based on the gene's semantic content. This is "context modulates
  generation" in a broad sense.
- **NOT preserved:** Learned weights. Attention is a differentiable,
  data-dependent weighting mechanism. Gene bindings are **static rules**
  authored by a human or derived from a reference image. They do not
  adapt to input. They do not have query/key/value structure. They are
  closer to CSS selectors than to attention heads. Also: attention
  operates over sequences; gene bindings operate over named channels.
- **Math:** Attention: output = softmax(QK^T/√d) · V. Gene binding:
  channel[param] += operation(amount). The gene binding is an additive
  perturbation, not a weighted combination. No softmax. No learned
  projections.
- **Directionality:** A→B: weak. The analogy holds only at the highest
  level of abstraction ("context changes output"). B→A: gene bindings
  are not attention and cannot be used as attention.
- **Evidence:** `vixel/vri-compiler.js` gene-binding pass. 7 channels:
  geometry, contour, lighting, atmosphere, palette, texture, density.
  11 gene-binding tests.
- **Notes:** If gene bindings were made data-dependent (e.g., the binding
  amount varies based on the scene content), this could be promoted to
  SC. As implemented, it is a static modulation — closer to a shader
  uniform than to an attention weight.

---

### SCR-017: Conditional generation ↔ Material → texture mapping

- **Strength:** `FA`
- **Preserved:** The intuition that a label (material name) selects a
  generation process (texture field). "bark" produces bark grain.
  "stone" produces stone noise. The label conditions the output.
- **NOT preserved:** Generative process. Conditional generation (GANs,
  diffusion, VAEs) learns a distribution p(x|c) and samples from it.
  Material→texture mapping is a **deterministic lookup + procedural
  function**. There is no distribution. There is no sampling. Given
  "bark" and a seed, the output is fixed. Also: the texture functions
  are hand-authored (frequency, amplitude, octaves per material kind),
  not learned.
- **Math:** Conditional generation: x ~ p_θ(x|c). Material mapping:
  x = f_kind(seed, params_kind). The first is stochastic and learned.
  The second is deterministic and authored.
- **Directionality:** A→B: weak analogy. B→A: material mapping is not
  a special case of conditional generation.
- **Evidence:** `vixel/vri-compiler.js` resolve-materials pass.
  `vixel/vri-schema.js` TEXTURE_KINDS (bark, foliage, moss, stone,
  dirt, water, cloud, fabric, corrosion, crystal). `vri-renderer.js`
  texture field pass.
- **Notes:** The deterministic, authored nature is a feature, not a bug.
  Scholomance Law requires determinism. A learned conditional generator
  would violate the law unless its weights were frozen and its sampling
  seeded. The analogy is useful for explaining the concept to ML
  practitioners but should not drive implementation decisions.

---

### SCR-018: Style transfer / LoRA ↔ Art genes

- **Strength:** `FA`
- **Preserved:** The intuition that a compact representation (gene packet)
  carries stylistic information that modulates the appearance of a
  rendered output without changing the underlying geometry. Genes
  derived from a reference image carry color palettes, lighting
  directions, texture parameters, and mark-making instructions.
- **NOT preserved:** Learned representations. Style transfer and LoRA
  operate on learned feature spaces (Gram matrices, weight deltas).
  Art genes are **explicit, human-readable parameter sets**. A gene
  packet is a JSON document with named fields. You can read it, edit
  it, diff it. A LoRA weight delta is an opaque tensor. Also: style
  transfer is typically image-to-image; genes are specification-to-render.
- **Math:** Style transfer: minimize ||φ(x) - φ_style||² + λ||ψ(x) -
  ψ_content||² where φ, ψ are VGG features. Art genes: render(packet
  + gene_bindings). The first is an optimization over a learned feature
  space. The second is a deterministic function application.
- **Directionality:** A→B: weak. Genes carry style information, but not
  in a learned feature space. B→A: art genes are not a special case
  of style transfer.
- **Evidence:** `scdna-art-gene.js` gene packet schema. `scdna-art-gene-derive.js`
  reference image → gene derivation. `vri-compiler.js` gene-binding pass.
  `sword-reference.art-genes.json` (8 genes, 99 cells, 13 bindings).
- **Notes:** The reference-derivation pipeline (image → color clustering
  → gene extraction) is the closest analogue to "learning from data."
  But the output is an explicit parameter set, not a weight matrix.
  This is by design: Curation Law requires human-readable, auditable
  artifacts.

---

### SCR-019: Reaction energy / activation energy ↔ Concept chemistry feasibility score

- **Strength:** `FA`
- **Preserved:** The intuition that a score ranks the viability of
  proposed syntheses. High score = more viable = more likely to
  succeed. Low score = less viable. The law gate acts as an infinite
  energy barrier (forbidden reactions). Stability classes (STABLE,
  METASTABLE, UNSTABLE) mirror thermodynamic stability.
- **NOT preserved:** Thermodynamics. The feasibility score is a weighted
  sum of cosine similarities and corpus attestation counts. It is not
  derived from energy landscapes, partition functions, or transition
  state theory. There is no temperature. There is no entropy term.
  The "activation energy" metaphor implies a barrier that can be
  overcome with sufficient input; the feasibility score is a static
  ranking with no dynamics.
- **Math:** Feasibility = (0.15·bond + 0.65·grounding + 0.20·coherence)
  × lawGate. This is a linear combination, not a Boltzmann factor.
  Stability classes are threshold bins, not energy minima.
- **Directionality:** A→B: useful metaphor for explaining the scoring
  system. B→A: the chemistry lab is not a thermodynamic simulator.
- **Evidence:** `concept-chemistry.js` `synthesize()`. W_BOND=0.15,
  W_GROUND=0.65, W_COHERE=0.20. STABLE_MIN=0.55, METASTABLE_MIN=0.30.
  13 tests.
- **Notes:** The chemistry metaphor was chosen deliberately for
  communication value. The actual math is information-retrieval
  scoring (cosine similarity + corpus frequency). The metaphor is
  honest as long as nobody tries to derive thermodynamic quantities
  from the scores.

---

### SCR-020: Catalysts ↔ Agents

- **Strength:** `MT`
- **Preserved:** The intuition that agents accelerate reactions (tasks)
  without being permanently altered. An agent reads the codebase,
  produces a change, and the codebase persists. The agent's context
  window is released after the session.
- **NOT preserved:** Catalysts are not consumed. Agents ARE consumed:
  context windows fill, sessions end, tokens cost money. Catalysts
  lower activation energy by providing an alternative reaction pathway.
  Agents provide labor, not an alternative pathway. Catalysts are
  specific to reactions; agents are (attempted to be) general-purpose.
  The metaphor breaks under any serious scrutiny.
- **Math:** None. This is a metaphor, not a mapping.
- **Directionality:** No.
- **Evidence:** `AGENTS.md` agent coordination table. Session memories.
- **Notes:** Useful in prose: "the agent catalyzed the implementation."
  Dangerous in engineering: do not design agent coordination protocols
  based on catalytic chemistry.

---

### SCR-021: Solvent / reaction medium ↔ Memory substrate

- **Strength:** `MT`
- **Preserved:** The intuition that the substrate is the medium in which
  reactions (concept syntheses, agent sessions) occur. The substrate
  provides context, grounding, and attestation. Without it, reactions
  have no environment to validate against.
- **NOT preserved:** Solvents participate in reactions. They dissolve
  reactants, stabilize intermediates, and affect reaction rates. The
  substrate does not dissolve or transform concepts. It is a **lookup
  table**, not a medium. Concepts do not diffuse through it. There is
  no concentration gradient. The metaphor is spatial ("ideas float in
  the substrate") but the reality is indexical ("ideas are looked up
  in the substrate").
- **Math:** None. The substrate is a database with vector indexing.
  A solvent is a thermodynamic phase. These are not the same kind of
  object.
- **Directionality:** No.
- **Evidence:** `~/.substrate/memory.sqlite`. `substrate_query()`,
  `substrate_store()`, `substrate_status()`. Concept chemistry
  grounding channel.
- **Notes:** The metaphor is useful for explaining why the substrate
  matters ("you need a medium for the chemistry to happen"). It is
  misleading for engineering ("the substrate should dissolve bad ideas").

---

### SCR-022: Reaction chain / synthetic pathway ↔ Pipeline stages

- **Strength:** `MT`
- **Preserved:** The intuition that the pipeline is a sequence of
  transformations where each stage's output is the next stage's input.
  Construction → SCDL → VRI → Render. Intermediates (packets, scenes)
  are isolable and inspectable.
- **NOT preserved:** Chemical equilibrium. Reaction chains in chemistry
  have forward and reverse rates, equilibrium constants, and
  thermodynamic driving forces. Pipeline stages are **one-way functions**.
  There is no reverse pass. There is no equilibrium. You cannot run
  the renderer backward to recover the SCDL source. Also: chemical
  reaction chains often have branching and feedback loops. The pipeline
  is a linear chain with optional skip stages.
- **Math:** Pipeline: output = f₄(f₃(f₂(f₁(input)))). Reaction chain:
  A ⇌ B ⇌ C ⇌ D with rate constants k₁, k₋₁, k₂, k₋₂, ... The
  pipeline has no reverse arrows.
- **Directionality:** No. The pipeline is not a reaction chain. It is
  a function composition. The metaphor is useful for communication
  but misleading for design.
- **Evidence:** `compile-asset.js` 5-stage pipeline. Stage timing
  diagnostics.
- **Notes:** If the pipeline were made reversible (e.g., a differentiable
  renderer that could backpropagate from pixels to SCDL), this could
  be promoted. As implemented, it is a one-way function chain.

---

### SCR-023: Checksum ↔ Embedding

- **Strength:** `FF`
- **Preserved:** Nothing useful. Both produce fixed-length vectors from
  content. That is where the similarity ends.
- **NOT preserved:** Everything that matters.
  - **Metric structure.** Embeddings live in a metric space where
    distance is meaningful (cosine similarity ≈ semantic similarity).
    Checksums have no meaningful metric. The Hamming distance between
    sha256("cat") and sha256("dog") is approximately 128 bits — the
    same as sha256("cat") and sha256("cat2"). Checksums exhibit the
    avalanche property: a 1-bit input change flips ~50% of output bits.
    Embeddings exhibit continuity: similar inputs produce similar outputs.
  - **Continuity.** Embedding functions are (approximately) continuous.
    Checksums are (deliberately) discontinuous.
  - **Differentiability.** Embeddings can be backpropagated through.
    Checksums cannot.
  - **Dimensionality semantics.** Each dimension of an embedding
    captures some latent feature. Each bit of a checksum captures
    nothing individually; the information is in the whole.
  - **Purpose.** Embeddings represent meaning. Checksums verify identity.
- **Math:** Checksum: H: {0,1}* → {0,1}^256, avalanche, no metric.
  Embedding: f: X → ℝ^d, continuous, cosine metric, differentiable.
  These are fundamentally different mathematical objects. Conflating
  them leads to incorrect reasoning (e.g., "we can cluster assets by
  checksum similarity" — no, you cannot).
- **Directionality:** No.
- **Evidence:** `sha256.js` (checksum). `concept-chemistry.js`
  `conceptVector()` (embedding). The concept chemistry module uses
  BOTH: sha256 for content addressing, cosine over hash-embeddings
  for similarity. They serve different purposes in the same module.
- **Notes:** This false friend was identified during the concept
  chemistry design session. The initial reaction scoring used checksum
  equality as a similarity signal, which produced meaningless results.
  The fix was to separate the two: checksums for identity, embeddings
  for similarity. **Cite this entry whenever someone proposes using
  checksums as a similarity metric.**

---

### SCR-024: Canonical JSON ↔ Context matrix

- **Strength:** `FF`
- **Preserved:** Nothing useful. Both involve "canonical" representations
  of structured data. That is where the similarity ends.
- **NOT preserved:** Everything that matters.
  - **Purpose.** Canonical JSON is a **serialization order** — a
    deterministic way to convert a JSON object to a string (sorted
    keys, no whitespace variation). A context matrix is a
    **co-occurrence structure** — a matrix M where M[i][j] counts
    how often token i appears near token j.
  - **Structure.** Canonical JSON is a string. A context matrix is a
    2D array. They are not the same type.
  - **Information.** Canonical JSON preserves the content of a single
    object. A context matrix captures statistical relationships across
    a corpus.
  - **The word "canonical."** In canonical JSON, "canonical" means
    "unique representative of an equivalence class" (all JSON objects
    with the same key-value pairs produce the same string). In context
    matrices, there is no standard use of "canonical." The similarity
    is purely lexical.
- **Math:** Canonical JSON: serialize: JSON → String, with sorted keys.
  Context matrix: M ∈ ℕ^(V×V) where M[i][j] = count(wᵢ, wⱼ, window).
  These are unrelated mathematical objects.
- **Directionality:** No.
- **Evidence:** `PolarisOS/packages/scene-packet/src/seal.ts`
  `canonicalJson()`. No context matrix exists in the codebase.
- **Notes:** This false friend was proposed in the "unifying theorem"
  discussion and correctly identified as non-equivalent by the user.
  **Cite this entry whenever someone proposes that canonical
  serialization is a form of co-occurrence analysis.**

---

### SCR-025: Programming language ↔ SCDL

- **Strength:** `FF`
- **Preserved:** SCDL has a grammar, typed operations, and a compiler
  pipeline. Superficially, it looks like a programming language.
- **NOT preserved:** Turing completeness. SCDL has no variables, no
  assignment, no loops, no conditionals, no recursion, no user-defined
  functions. It is a **declarative specification format** — closer to
  a scene description language (like USD or glTF) than to a programming
  language. Calling it a "language" in the programming-language sense
  leads to incorrect expectations (e.g., "can I write a loop in SCDL?"
  No. "Can I define a function?" No.).
- **Math:** SCDL is a typed term algebra evaluated by a homomorphism to
  coordinates. A programming language is a Turing-complete rewrite
  system. These are different classes of formal language (regular/tree
  vs. Type-0 in the Chomsky hierarchy).
- **Directionality:** No.
- **Evidence:** `scdl/scdl.grammar.js` (36 KB). No loop or conditional
  constructs. The compiler is a pass pipeline (tree-to-tree transforms),
  not an interpreter or VM.
- **Notes:** SCDL stands for "Scholomance Code Description Language."
  The "Code" refers to bytecode-style asset encoding, not program
  source code. The name is a historical artifact. **Cite this entry
  whenever someone asks for control flow in SCDL.**

---

## 3. Summary Matrix

| ID | External Term | Scholomance Term | Strength | Bidirectional |
|----|--------------|-----------------|----------|---------------|
| SCR-001 | Dense latent embedding | Substrate 4-bit vectors | `ID` | Yes |
| SCR-002 | Content-addressed hash | Checksum (sha256/fnv1a/SCD64) | `ID` | Yes |
| SCR-003 | Rasterization | Scanline fill / VRI raster pass | `ID` | Yes |
| SCR-004 | Reference frames | VRI coordinateSpace | `ID` | Yes |
| SCR-005 | Monotonic clock / Lamport ts | Revision monotonicity gate | `ID` | Yes |
| SCR-006 | Graceful degradation | Degradation ladder | `ID` | Yes |
| SCR-007 | Constraint infeasibility | Solver refusal | `ID` | Yes |
| SCR-008 | Attributed molecular graph | Scene graph + constraint graph | `SC` | A→B injective |
| SCR-009 | Labeled graph operations | SCDL typed operations | `SC` | A→B faithful |
| SCR-010 | CSP | Construction solver | `SC` | A→B (restricted) |
| SCR-011 | Dependency DAG | Topological sort | `ID` | Yes |
| SCR-012 | Hard constraints / guardrails | Law gates | `SC` | A→B |
| SCR-013 | Canonical serialization + MAC | Sealed packet | `SC` | A→B |
| SCR-014 | Serialization protocol / IDL | Wire format (toLuaWire) | `SC` | A→B |
| SCR-015 | Semantic tensor decomposition | VRI 7-pass renderer | `FA` | Analogy only |
| SCR-016 | Context matrices / attention | Gene binding channels | `FA` | Analogy only |
| SCR-017 | Conditional generation | Material → texture mapping | `FA` | Analogy only |
| SCR-018 | Style transfer / LoRA | Art genes | `FA` | Analogy only |
| SCR-019 | Reaction energy | Feasibility score | `FA` | Analogy only |
| SCR-020 | Catalysts | Agents | `MT` | No |
| SCR-021 | Solvent / reaction medium | Memory substrate | `MT` | No |
| SCR-022 | Reaction chain | Pipeline stages | `MT` | No |
| SCR-023 | Embedding | Checksum | `FF` | No |
| SCR-024 | Context matrix | Canonical JSON | `FF` | No |
| SCR-025 | Programming language | SCDL | `FF` | No |

**Distribution:** 8 Identity, 6 Structural Correspondence, 5 Functional Analogy,
3 Metaphor, 3 False Friend.

---

## 4. Usage Protocol

### For AI agents arriving in a new session

1. Read this document before exploring the codebase.
2. When you encounter an ML/CS concept, look it up in §2.
3. If the correspondence is `ID` or `SC`, you can reason by analogy
   with confidence. Check the "NOT preserved" field for boundary cases.
4. If the correspondence is `FA`, use it for explanation only. Do not
   generate code based on the analogy.
5. If the correspondence is `MT`, use it in prose. Never in engineering.
6. If the correspondence is `FF`, **do not use it.** Cite the SCR number
   when someone else proposes it.

### For the Concept Chemistry Lab

When scoring a reaction A + B → C:
- Look up A, B, and C in this registry.
- If any reactant maps to a Scholomance concept at `ID` or `SC` strength,
  the grounding channel should receive a bonus (the concept is attested
  in the codebase, not just in the corpus).
- If the product concept maps at `FF` strength, the reaction should be
  flagged as a false-friend risk.
- This protocol is not yet implemented in `concept-chemistry.js`. It is
  specified here for future integration.

### For adding new entries

1. Propose the correspondence with a concrete example.
2. Default strength is `FA`.
3. To promote to `SC`: provide a tested implementation that demonstrates
   structure preservation in both directions.
4. To promote to `ID`: demonstrate that the two terms refer to the same
   mathematical object with no information loss.
5. To add a `FF`: provide a concrete counterexample showing where the
   apparent correspondence breaks.
6. Update the summary matrix in §3.
7. Increment the version number.

---

## 5. Reclassification Log

| Date | Entry | Old | New | Reason |
|------|-------|-----|-----|--------|
| 2026-07-30 | All | — | Initial | Registry created. |

---

## 6. Known Gaps

1. **No substrate co-occurrence channel.** The concept chemistry lab's
   grounding term uses corpus document frequency, not codebase
   co-occurrence. Once the substrate vector engine is online, entries
   in this registry should be ingested as grounding anchors.

2. **No formal verification of SC entries.** Structural correspondences
   (SCR-008 through SCR-014) are argued informally. A future version
   could provide formal proofs (e.g., "the construction solver
   satisfies the CSP axioms") or counterexamples.

3. **No promotion pathway for FA entries.** Functional analogies
   (SCR-015 through SCR-019) could become structural if the
   implementation changes. For example, if VRI passes were reformulated
   as tensor modes, SCR-015 would be promoted. No process exists for
   this yet beyond manual reclassification.

4. **No external validation.** This registry is self-referential — it
   maps the codebase's vocabulary to external vocabulary using the
   codebase's own evidence. An external reviewer (ML practitioner,
   formal methods engineer) should validate the strength classifications.

5. **Synonymy gap.** The hash-based embeddings in concept-chemistry.js
   cannot detect synonymy between terms with no shared subwords
   (e.g., "determinism" ≈ "reproducibility"). This registry partially
   compensates by providing explicit correspondences, but the chemistry
   lab cannot yet use them automatically.

---

*This document is a bridge, not a territory. The codebase is the territory.
When the bridge and the territory disagree, the territory wins.* 🜏
