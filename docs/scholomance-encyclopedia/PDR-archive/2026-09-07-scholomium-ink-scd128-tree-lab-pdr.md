# PDR: Scholomium Ink — SCD128 Art Intelligence and Seven-Tree Laboratory

**Status:** Implemented — Core contracts, Seven-Tree Laboratory, 14 variants, and 3 hybrids delivered and verified (26/26 tests green). Recommended for Promotion per `PIR-20260907-SCHOLOMIUM-INK-SCD128-PILOT.md`; awaiting Angel's final sovereign sign-off.

**Classification:** Architectural | PixelBrain | SCDL v2 | Art Forensics | Deterministic Rendering Intelligence | Corpus | AMP Derivation

**Priority:** Critical

**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-SCHOLOMIUM-INK-SCD128-TREE-LAB-2026-09-07`

## Owner(s)

- **Angel / project artist:** authors and approves the seven master tree sprites and every canonical corpus admission.
- **Codex:** SCD128 schemas, isolation law, Lawyer contract, projection boundary, and SCDL/PixelBrain architecture.
- **Gemini:** implementation, deterministic analyzers, adapters, tests, corpus runner, and CI gates within the approved contracts.
- **Claude:** any later Studio surface or visual workflow; no UI work is required by this PDR.
- **Escalation owner:** Angel.

## 1. Executive Summary

Scholomium Ink is a project-owned visual research laboratory that turns carefully authored pixel-art specimens into deterministic, explainable construction knowledge. Its first bounded program is a seven-tree corpus: Oak, Hickory, Redwood, Cedar, Pine, Evergreen, and Maple. Every master sprite is authored by the project rather than acquired from an outside art corpus. The masters are expensive teaching specimens; their durable deliverable is a tree-making language that makes later natural and high-fantasy trees substantially faster to create.

The laboratory introduces **SCD128**, a new art-specific sibling of SCD64. SCD128 does not modify, extend, or reinterpret the existing SCD64 wire. SCD128 is exactly 128 uppercase hexadecimal characters arranged as sixteen 8-character blocks. It contains two sealed 64-character witnesses:

```text
SCD128 = FORM64 || REALIZATION64
```

`FORM64` describes geometry, topology, silhouette, proportion, mass, negative space, and world interaction. `REALIZATION64` describes pixel density, edges, clusters, values, materials, palette, light, and surface variation. The banks never read, import, modify, infer, or condition themselves on each other. They have separate schemas, analyzers, validators, vocabularies, version markers, and full integrity digests.

Only a pure deterministic **SCD128 Lawyer** may hear both witnesses. The Lawyer never mutates a witness and never renders pixels. It issues either a canonical compatibility receipt or a quarantined laboratory receipt. A projection adapter may render only the Lawyer's bounded directives. Quarantined previews may teach a human, but they can never teach Scholomium Ink: they cannot enter a corpus, derive an AMP, become ancestry, or be exported as canonical evidence.

If the tree pilot passes its explicit promotion gates, the SCD128 core becomes a standard pre-render intelligence plugin for other PixelBrain asset families. The sixteen roles stay universal; each family must supply isolated vocabularies, analyzers, Lawyer policy, and projection adapter. This PDR does not implement those later families.

## 2. Problem Statement

Pixel-art generation becomes generic when visual effects are applied without a durable account of form. It also becomes fragile when silhouette, palette, topology, texture, and lighting share one mutable representation: a color or finish pass can silently deform geometry, a structural edit can rewrite pixel language, and later failures cannot be attributed to one stage.

Seven finished PNGs alone would not solve that problem. The system must preserve why each tree works:

- what establishes its family silhouette;
- how trunk and branches connect;
- where canopy mass and negative space sit;
- how its local pixel clusters communicate bark, foliage, depth, and light;
- which rules are mandatory, variable, or forbidden; and
- whether a generated descendant remains lawful.

The first seven specimens must therefore become structured, sealed evidence. Natural morphology provides the plausibility substrate. Controlled recombination may then produce Scholomance species that do not exist in nature but still appear grown rather than assembled.

## 3. Product Goal

Create a deterministic art-intelligence pipeline that can:

1. analyze seven project-authored tree masters through isolated form and realization views;
2. encode each view as one independently valid 64-character witness;
3. bind the witnesses through a deterministic Lawyer without cross-bank contamination;
4. project an approved binding into semantic SCDL v2 source and editable PixelBrain layers;
5. derive explainable tree-family AMPs from canonical evidence only;
6. generate recognizable unseen variants and structurally plausible Scholomance hybrids; and
7. prove that the same core can later host family-specific adapters without treating tree vocabulary as universal art truth.

## 4. Non-Goals

- No external, open-source, scraped, purchased, or third-party art corpus in v1.
- No external image attribution or license-ingestion system in v1.
- No modification, migration, or reinterpretation of SCD64 or its existing diagnostic, ART, MEMORY, or NAV domains.
- No neural training, hidden stochastic model, style imitation, or opaque learned embedding in the canonical path.
- No claim that seven specimens statistically represent all natural trees.
- No automatic admission of generated output into the corpus.
- No character redesign, weapon adapter, architecture adapter, terrain adapter, or other post-tree family implementation.
- No new Studio UI surface in this PDR.
- No direct pixel rendering inside the Lawyer.
- No use of a quarantined preview as AMP evidence, parentage, validation evidence, or canonical export.
- No promise that SCD128 eliminates all future bugs; it prevents cross-bank influence, contains blast radius, and makes failures attributable.

## 5. Governing Principles

1. **Form is first.** FORM64 is produced and validated independently of decorative realization.
2. **The witnesses are sealed.** Neither bank can observe or invoke the other.
3. **The Lawyer is the only joinder.** Cross-bank compatibility exists only in a receipt.
4. **A receipt is not a render.** Projection remains a separate adapter stage.
5. **Canonical evidence is explicit.** Human approval is required before corpus admission.
6. **Quarantine is non-heritable.** Diagnostic previews never enter automated derivation.
7. **Exact evidence accompanies compact identity.** Eight-character blocks are indexes, not reversible geometry.
8. **Determinism is mandatory.** Identical inputs, schemas, and policy produce byte-identical packets and receipts.
9. **Asset families share roles, not vocabularies.** Tree terms never silently become character, weapon, or architecture terms.
10. **Pixels remain authoritative for realization.** Structural vector or skeleton evidence cannot fabricate color, material, texture, or lighting claims.

## 6. SCD128 Wire Contract

### 6.1 Physical layout

SCD128 follows SCD64's character-count naming convention:

```text
128 uppercase hexadecimal characters
= 16 blocks × 8 hexadecimal characters
= FORM64 (blocks 01–08) || REALIZATION64 (blocks 09–16)
```

The wire represents 512 bits. The protocol name describes its 128-character wire length, not a 128-bit hash.

The first FORM64 block begins with `81`, identifying FORM64 schema version 1, followed by six characters of its truncated hash payload. The first REALIZATION64 block begins with `91`, identifying REALIZATION64 schema version 1, followed by six hash characters. The inspected SCD64 registry does not currently use either prefix. Schema registration must reserve them before implementation; later bank versions advance only their own low nibble (`82`, `92`, and so on) and never reinterpret an existing prefix.

### 6.2 Compact identity versus decoded evidence

The 128-character string cannot reconstruct an asset. Each bank packet retains its eight decoded slot records and a full digest. Each slot record contains:

```ts
interface SCD128SlotRecordV1 {
  slot: string;
  position: number;                 // 0..7 within its own bank
  canonicalCategory: string;        // allow-listed family vocabulary
  parameters: Record<string, ExactValue>;
  evidenceRefs: string[];           // project-local, content-addressed evidence
  confidence: "measured" | "authored" | "inferred" | "unbound";
  canonicalDerivation: string;
  digest256: string;                // full uppercase SHA-256 hex
  blockHex: string;                 // 8-char wire block
}
```

`ExactValue` is an integer, string enum, boolean, or normalized rational `{ numerator, denominator }`. Canonical hashing must not depend on binary floating-point spelling, object insertion order, timestamps, filesystem location, or environment.

Each 8-character block is derived from the canonical slot record. The first block in each bank uses its version prefix plus six hash characters; the remaining blocks use eight hash characters. Full 256-bit slot and bank digests remain in the decoded envelope. If two different full digests ever map to the same truncated block, generation fails closed with a collision diagnostic; it never treats them as identical.

### 6.3 Proposed envelopes

These are new contracts and must be registered in `SCHEMA_CONTRACT.md` by Codex with Angel's awareness before implementation:

```ts
interface SCD128BankPacketV1 {
  contract: "SCD128-FORM64-v1" | "SCD128-REALIZATION64-v1";
  schemaVersion: 1;
  adapterFamily: string;            // e.g. "tree"; not a species claim
  checksum64: string;
  digest256: string;
  slots: readonly SCD128SlotRecordV1[]; // exactly 8, fixed order
  evidenceDigest: string;
}

interface SCD128ArtPacketV1 {       // emitted only by the Lawyer
  contract: "SCD128-ART-v1";
  schemaVersion: 1;
  checksum128: string;              // form.checksum64 + realization.checksum64
  form: SCD128BankPacketV1;
  realization: SCD128BankPacketV1;
  sourceProvenance: ScholomiumInkProvenanceV1;
}
```

Before a hearing, FORM64 and REALIZATION64 exist only as two separate bank packets. No caller may pre-compose them into `SCD128ArtPacketV1`. The Lawyer alone may construct the combined envelope and `checksum128` after independently validating both witnesses. A laboratory hearing may create a diagnostic composite address, but that address carries no canonical authority.

`checksum128` is therefore a compact post-hearing composite address. It does not replace the full digests or decoded evidence.

## 7. FORM64 — Sealed Structural Witness

FORM64 accepts structural evidence only.

1. **`ASSET_CLASS`** — asset family, authored specimen identity, and structural archetype.
2. **`SCALE_FRAME`** — dimensionless coordinate frame, projection, orientation, normalization law, and ground anchor.
3. **`SILHOUETTE`** — crown envelope, trunk exposure, outer-contour behavior, protrusions, and occupied-area ratio.
4. **`STRUCTURAL_SKELETON`** — trunk axis, branch graph, attachment hierarchy, branching order, taper direction, and connectivity.
5. **`PROPORTION`** — normalized height/width, trunk/crown, branch-length, crown-position, and thickness ratios.
6. **`MASS_DISTRIBUTION`** — canopy masses, centers, overlap, centroid, lean, visual balance, and vertical weight distribution.
7. **`NEGATIVE_SPACE`** — branch gaps, canopy windows, internal voids, opening sizes, placement rhythm, and silhouette penetrations.
8. **`WORLD_FOOTPRINT`** — roots, ground contact, collision, occlusion, render-sort anchor, and player-passage behavior.

FORM64 rejects hue, palette, material color, highlights, lighting direction, decorative texture, dithering, finish scoring, or decorative pixel-cluster fields. Its analyzer may receive silhouette masks, semantic geometry, skeletons, anchors, collision, and occlusion. Monochrome labels may distinguish overlapping masses but cannot encode artistic color decisions.

Changing palette alone must leave FORM64 byte-identical. Structural changes affect only the relevant FORM64 slots; they do not invoke REALIZATION64.

## 8. REALIZATION64 — Sealed Pixel-Language Witness

REALIZATION64 accepts realization evidence only.

1. **`PIXEL_DENSITY`** — native resolution, cluster quantum, detail frequency, minimum readable feature, and intended viewing scale.
2. **`EDGE_LANGUAGE`** — outline weight, selective outlining, stair cadence, local edge breaks, anti-alias policy, and boundary contrast.
3. **`CLUSTER_RHYTHM`** — pixel-cluster size distribution, repetition, spacing, directional flow, isolated-cell limits, and noise thresholds.
4. **`VALUE_HIERARCHY`** — value bands, contrast relationships, focal priority, shadow grouping, and readability without hue.
5. **`MATERIAL_LANGUAGE`** — local marks and clusters that represent bark, leaves, needles, exposed wood, moss, or magical surface material.
6. **`PALETTE_LOGIC`** — material-role colors, hue relationships, saturation hierarchy, temperature movement, seasonal shifts, and palette limits.
7. **`LIGHT_RESPONSE`** — light direction, shadow law, highlights, transmitted canopy light, ambient contribution, and local occlusion response.
8. **`SURFACE_VARIATION`** — bounded bark marks, foliage texture, hue drift, weathering, age marks, and decorative distribution that do not alter FORM64.

REALIZATION64 rejects skeleton nodes, branch attachment coordinates, crown dimensions, trunk taper, collision geometry, root placement, global silhouette changes, or any command that adds, removes, or moves structural mass.

Its analyzer receives color/value/material evidence and local pixel neighborhoods. Boundary samples are local and stripped of global skeleton labels. The analyzer has no permission to emit geometry. A form-only evidence mutation with the realization evidence view frozen must leave REALIZATION64 byte-identical.

Derivation lineage, corpus admission, and curator verdict do not consume realization slots. They belong to provenance and Lawyer receipts; a witness cannot rule on its own admissibility.

## 9. Isolation Architecture

```text
project-authored master
        │
        ├── form evidence extractor ──> FORM VIEW ──> FORM64 analyzer ──> sealed FORM64
        │
        └── realization extractor ───> REALIZATION VIEW ──> REALIZATION64 analyzer ──> sealed REALIZATION64

sealed FORM64 ───────────────┐
                             ├──> SCD128 Lawyer ──> immutable receipt
sealed REALIZATION64 ────────┘
```

Required isolation:

- separate schema modules;
- separate canonical vocabularies;
- separate analyzer modules;
- separate validators and property tests;
- no analyzer import path to the opposite bank;
- no shared mutable cache or hidden singleton;
- no bank generator receiving the opposite packet as an argument;
- immutable outputs;
- evidence-view schemas that reject forbidden fields;
- a static dependency gate that fails if either bank imports the other.

The original authored asset may be the common source of both redacted views. The views are independently derived and immutable. Cross-bank interpretation begins only at the Lawyer.

## 10. SCD128 Lawyer

### 10.1 Responsibility

The Lawyer is a pure, deterministic adjudicator. It receives:

```ts
interface SCD128HearingInputV1 {
  form: SCD128BankPacketV1;
  realization: SCD128BankPacketV1;
  policy: SCD128FamilyCounselPolicyV1;
  projectionContext: Readonly<Record<string, unknown>>;
}
```

It independently validates both packets, checks family-specific compatibility, records every satisfied rule and conflict, and issues a receipt. It cannot mutate packets, author missing values, silently coerce incompatibilities, invoke an AMP, or render pixels.

The Lawyer is the only module allowed to import both bank contracts. Family analyzers and projection adapters may not do so.

### 10.2 Canonical hearing

A canonical hearing succeeds only when:

- both packets pass their independent schemas and full-digest checks;
- both identify the same asset-family adapter and compatible schema epoch; this is the generic `tree` adapter identity, not a requirement that realization independently infer Oak, Maple, or another natural family;
- all mandatory compatibility rules pass;
- no required value is `unbound`;
- no truncated-block collision exists;
- projection directives are complete and bounded; and
- the human approval state required for corpus admission exists separately.

An approved receipt permits projection and canonical export. It does not automatically admit the output into a corpus.

### 10.3 Laboratory hearing

A failed or uncertain hearing may issue a quarantined diagnostic receipt. The laboratory may render a visibly labelled preview so a human can understand the conflict. The preview cannot be represented as canonical output.

### 10.4 Receipt contract

```ts
interface SCD128CounselReceiptV1 {
  contract: "SCD128-COUNSEL-v1";
  schemaVersion: 1;
  mode: "canonical" | "laboratory";
  verdict: "approved" | "quarantined";
  checksum128: string;
  formDigest256: string;
  realizationDigest256: string;
  policyId: string;
  policyDigest256: string;
  satisfiedRules: readonly string[];
  conflicts: readonly SCD128CounselConflictV1[];
  projectionDirectives: readonly SCD128ProjectionDirectiveV1[];
  receiptDigest256: string;
}
```

Canonical directives must be sufficient for a downstream projection adapter without that adapter independently reopening and combining both witness schemas. Laboratory directives are explicitly diagnostic and carry no canonical authority.

## 11. Quarantine and Corpus Admission

A quarantined preview may be viewed, compared, annotated by the artist, revised by replacing either witness, and returned for a new hearing.

It may never:

- derive or update a grammar;
- derive, certify, select, or register an AMP;
- act as a parent for a natural or Scholomance variant;
- count toward corpus coverage or success metrics;
- be exported as a canonical asset;
- be silently upgraded after policy or schema changes; or
- enter any automated feedback loop.

Human annotations on a quarantined preview are new authored evidence, not machine-learned truth. Clearing quarantine requires new validated packet input and a new canonical hearing.

Canonical hearing approval and corpus admission are distinct gates. Admission requires explicit human action and an immutable admission receipt that cites the exact SCD128, full packet digests, source digest, author, and Lawyer receipt.

## 12. Seven-Tree Pilot Corpus

### 12.1 Required masters

The initial corpus contains at least one canonical, project-authored master for each of these seven families:

1. **Oak** — broad crown, heavy limbs, lower branching, and controlled asymmetry.
2. **Hickory** — taller oval crown, straighter trunk, and upward branch tendency.
3. **Redwood** — extreme verticality, massive tapering trunk, compressed lateral spread, and scale cues.
4. **Cedar** — layered horizontal boughs and irregular terraces.
5. **Pine** — visible trunk, separated tiers, irregular radial branching, and open negative space.
6. **Evergreen** — a project-defined dense conical archetype, not a botanical claim; deliberately differentiated from Pine, Cedar, and Redwood.
7. **Maple** — rounded/lobed crown masses, radiating branch structure, and season-capable palette logic.

The family briefs are hypotheses to be tested during authorship, not permission to force every specimen into a stereotype. Final measured packets are authoritative for what was actually authored.

### 12.2 Required evidence bundle per master

Every master must include:

- an authored structural brief;
- semantic SCDL v2 source;
- editable semantic layers or durable per-layer surfaces;
- native-resolution PNG preview and enlarged nearest-neighbor preview;
- isolated form and realization evidence views;
- one validated FORM64 packet;
- one validated REALIZATION64 packet;
- one approved Lawyer receipt;
- exact source, packet, and render digests;
- project authorship provenance; and
- an explicit corpus-admission receipt.

The tree representation must use dimensionless world-scale measurements. Current character dimensions are not canonical tree scale. Output profiles may render provisional game-scale previews, but changing future actor proportions must not invalidate tree evidence or grammar.

### 12.3 Semantic tree decomposition

The initial SCDL masters should preserve meaningful editing and analysis boundaries rather than color-fragment layers. The minimum semantic decomposition is:

```text
roots_and_ground
trunk
primary_branches
secondary_branches
canopy_masses
foliage_edges
surface_detail
ground_shadow
highlights
```

Families may omit a semantically irrelevant layer or add a named family-specific layer. The final packet must record the actual decomposition; missing layers cannot be silently synthesized by the analyzer.

## 13. Pattern Derivation and Tree AMPs

Scholomium Ink derives rules, not copied coordinates. Tree-family derivation must identify:

- mandatory invariants;
- bounded parameters;
- legal variation ranges;
- forbidden combinations;
- dependencies within FORM64 only;
- dependencies within REALIZATION64 only; and
- compatibility questions that belong exclusively to the Lawyer.

Each derived tree AMP must be deterministic, seed-explicit, explainable, and scoped to declared read/write regions. A Tree AMP cannot bypass the Lawyer, write both banks, or accept quarantined evidence.

The initial pilot must derive enough structure to generate:

- at least two previously undrawn natural variants per family, for at least fourteen natural variants total; and
- at least three original Scholomance hybrid species.

A hybrid must cite parent SCD128 packets and declare which rules or parameters are inherited, transformed, or original. Parentage is provenance, not permission for banks to communicate. Hybrid form is resolved within FORM64 derivation, hybrid realization within REALIZATION64 derivation, and their pairing is heard by the Lawyer.

Example design intent:

```text
redwood vertical law
+ cedar terrace rhythm
+ maple canopy lobing
+ an original supernatural deformation
= a new Scholomance species with plausible growth logic
```

No hybrid may be admitted merely because it is decorative. It must pass form readability, realization coherence, Lawyer compatibility, and human curation.

## 14. SCDL and PixelBrain Integration

SCD128 is a rendering-intelligence and adjudication plugin. It is not a rasterizer.

```text
canonical corpus evidence
        ↓
family grammar / Tree AMP
        ↓
sealed FORM64 + sealed REALIZATION64
        ↓
SCD128 Lawyer
        ↓
approved counseled asset plan
        ↓
SCD128-to-SCDL projection adapter
        ↓
semantic SCDL v2 source / packet
        ↓
PixelBrain Studio preview, manual inspection, and explicit admission/export
```

The projection adapter consumes the Lawyer's counseled plan, not two raw witnesses that it recombines independently. It emits semantic layers compatible with Pixel-Art Studio editing and preserves SCDL v2's deterministic, never-throw diagnostic contract. The adapter may not hide a Lawyer conflict behind a renderer fallback.

Existing SCDL v2 and PixelBrain packet contracts remain authoritative. SCD128 is additive metadata and pre-render control; it does not replace the lattice, layer surfaces, scene graph, asset packet, AMP ABI, or compiler passes.

## 15. Extension Model After Trees

The SCD128 core may be promoted into the normal PixelBrain authoring workflow only after the tree pilot satisfies every promotion gate in this PDR.

The sixteen slot roles and core sealing/Lawyer/quarantine machinery remain universal. Each later asset family must provide:

- a family-specific FORM64 vocabulary;
- a family-specific REALIZATION64 vocabulary;
- two isolated evidence-view extractors;
- two isolated analyzers and validators;
- a family-specific Lawyer policy;
- a family-specific projection adapter;
- a dedicated canonical corpus; and
- its own PDR and acceptance evidence.

Examples include characters, weapons, armor, buildings, terrain, vegetation, spell effects, and interface ornament. Tree vocabulary must not be imported as a shortcut. Shared vocabulary may be promoted only after two or more implemented families prove the same meaning and validation law.

## 16. Functional Requirements and Acceptance Criteria

### F1 — SCD128 physical contract

- Generation emits exactly 128 uppercase hexadecimal characters.
- Parsing produces exactly sixteen ordered 8-character blocks and two independently parsable 64-character banks.
- `checksum128 === form.checksum64 + realization.checksum64`.
- SCD64 generation, parsing, glossary, indexes, and comparisons remain byte-identical.

### F2 — Canonical slot records

- Each bank contains exactly eight allow-listed slots in fixed order.
- Canonicalization uses exact values, stable key order, and sorted set-like arrays.
- Each slot retains full and truncated digests.
- Unknown fields, non-finite numbers, floating-point-only ratios, duplicate slots, missing slots, or digest mismatches fail closed.

### F3 — Bank isolation

- FORM64 and REALIZATION64 schema/analyzer dependency graphs are disjoint.
- Opposite-bank fields are rejected before packet generation.
- Palette-only mutations leave FORM64 byte-identical.
- Form-only evidence mutations with the realization view frozen leave REALIZATION64 byte-identical.
- Neither analyzer accepts the opposite packet as input.

### F4 — Lawyer

- Identical input packets, policy, and context produce byte-identical receipts over 100 repeated runs.
- The Lawyer is the only production module permitted to import both bank contracts.
- It returns all conflicts in stable order and never silently chooses a default.
- It never mutates witness packets.
- It never imports SCDL rasterizers, PixelBrain effects, DOM, network, or persistence code.

### F5 — Two hearing modes

- Canonical mode fails closed on any mandatory conflict or uncertainty.
- Laboratory mode may emit diagnostic projection directives only.
- Every laboratory preview is visibly labelled and programmatically `quarantined`.
- No laboratory receipt can pass canonical export or corpus-admission validation.

### F6 — Corpus

- All seven required project-authored masters have complete evidence bundles and admission receipts.
- Corpus enumeration rejects duplicate source digests, missing evidence, or quarantined ancestry.
- No external-image acquisition path is present in the pilot.

### F7 — Generalization

- At least fourteen unseen natural variants are generated: two per family.
- At least three original Scholomance hybrids cite lawful parentage and contain an original declared transformation.
- Natural variants remain recognizable from form evidence without depending on palette.
- Hybrids pass family-specific plausibility rules without copying a parent's coordinates.

### F8 — Workflow leverage

- Authoring time is recorded for masters and generated descendants.
- Median hands-on authoring and cleanup time for accepted descendants is at least 50% lower than the median master-authoring time before promotion beyond trees.
- Manual corrections remain explicit revisions; they cannot be folded invisibly back into a grammar.

### F9 — SCDL/PixelBrain integration

- Approved counseled plans project into valid semantic SCDL v2.
- Compiler diagnostics remain structured and never escape as raw exceptions.
- Rendered native-size pixels and enlarged nearest-neighbor previews are inspected for every master, one variant per family, and every hybrid.
- Editable semantic parts survive ingestion into Pixel-Art Studio.

## 17. Error and Uncertainty Semantics

All failures use the existing `PB-ERR-v1` envelope. SCD128 defines stable module/reason identifiers rather than a parallel error format. At minimum:

```text
SCD128_FORM_SCHEMA
SCD128_REALIZATION_SCHEMA
SCD128_FORBIDDEN_FIELD
SCD128_DIGEST_MISMATCH
SCD128_BLOCK_COLLISION
SCD128_BANK_VERSION
SCD128_COUNSEL_CONFLICT
SCD128_COUNSEL_UNBOUND
SCD128_PROJECTION_REFUSED
SCD128_QUARANTINE_VIOLATION
SCD128_CORPUS_ADMISSION
```

Analyzer APIs return a never-throw result envelope:

```ts
type SCD128AnalysisResult<T> = Readonly<{
  ok: boolean;
  packet: T | null;
  diagnostics: readonly BytecodeErrorRecord[];
}>;
```

An invalid bank never produces a partial canonical packet. An invalid hearing never produces an approved receipt. `unbound` is explicit and cannot be guessed into a plausible value. Laboratory previews preserve uncertainty rather than converting it to false evidence.

## 18. Determinism, Security, and Data Sovereignty

- All canonical analyzers and Lawyer policies are pure and deterministic.
- Variation requires an explicit, recorded seed; no clock, process, or environment seed is legal.
- Source and evidence files remain project-local in the pilot.
- No network request is required to analyze, adjudicate, derive, project, or render a pilot asset.
- No user artwork leaves the browser or local workspace without explicit action.
- No telemetry captures source pixels, SCDL, packet evidence, or human annotations.
- Canonical vocabularies are allow-listed; no `eval`, dynamic user module import, or executable corpus payload is permitted.
- Corpus admission is explicit, content-addressed, and append-only. Removal creates a tombstone and prevents future derivation while preserving the audit trail required to invalidate descendants.

## 19. Architecture and Proposed File Map

The exact file map is implementation guidance and remains subject to the implementation plan after written-PDR approval.

```text
codex/core/pixelbrain/scholomium-ink/
  scd128/
    scd128.constants.js
    scd128.canonical.js
    scd128.packet.js
    form64/
      form64.schema.js
      form64.analyzer.js
      form64.vocabulary.js
    realization64/
      realization64.schema.js
      realization64.analyzer.js
      realization64.vocabulary.js
    counsel/
      counsel.schema.js
      counsel.js
      quarantine.js
  corpus/
    corpus.schema.js
    corpus-ledger.js
    admission.js
  families/
    tree/
      tree-form.vocabulary.js
      tree-realization.vocabulary.js
      tree-counsel.policy.js
      tree-derivation.js
      tree-projection.adapter.js
      tree-amp-manifest.js

assets/ASSETS/scholomium-ink/trees/
  oak/
  hickory/
  redwood/
  cedar/
  pine/
  evergreen/
  maple/

scripts/
  scholomium-ink-corpus.mjs
  scholomium-ink-hear.mjs

tests/codex/core/pixelbrain/scholomium-ink/
  scd128-wire.test.js
  scd128-canonical.test.js
  bank-isolation.test.js
  counsel.test.js
  quarantine.test.js
  tree-corpus.test.js
  tree-generalization.test.js
  tree-projection.test.js
```

Dependency direction:

```text
exact canonical core
    ↑
isolated FORM64          isolated REALIZATION64
    └──────────────┬──────────────┘
                   ↑
                Lawyer
                   ↑
          family policy/adapters
                   ↑
             CLI / Studio facade
```

No UI imports core modules directly. A later Studio surface must use a browser-safe facade and preserve local draft sovereignty.

## 20. Implementation Phases

### Phase 0 — Contract registration and fixtures

- Register proposed SCD128 contracts and error modules.
- Freeze canonical serialization and exact-value rules.
- Add minimal hand-constructed packet fixtures.
- Exit: schema review approved; SCD64 differential baseline captured.

### Phase 1 — SCD128 core and sealed banks

- Implement canonical hashing, generation, parsing, full-digest verification, and collision detection.
- Implement FORM64 and REALIZATION64 schemas with forbidden-field gates.
- Exit: wire, canonicalization, mutation, and bank-isolation suites pass.

### Phase 2 — Lawyer and quarantine

- Implement family-policy interface, canonical/laboratory hearings, receipts, and quarantine gates.
- Exit: 100-run determinism, immutability, conflict, and quarantine mutation tests pass.

### Phase 3 — Tree evidence adapter

- Define tree vocabularies and isolated evidence-view schemas.
- Bind durable SCDL layer/surface evidence without making raster output the structural source of truth.
- Exit: one synthetic tree fixture produces independently valid witnesses and an approved receipt.

### Phase 4 — Seven authored masters

- Author Oak, Hickory, Redwood, Cedar, Pine, Evergreen, and Maple.
- Inspect every native render before corpus admission.
- Exit: seven complete, approved evidence bundles exist; no external corpus path exists.

### Phase 5 — Pattern and AMP derivation

- Extract per-family invariants, ranges, forbidden combinations, and variation laws.
- Implement deterministic Tree AMPs behind the existing AMP ABI and explicit selection/preview rules.
- Exit: each family can generate an unseen candidate without literal coordinate copying.

### Phase 6 — Natural variants and Scholomance hybrids

- Generate at least fourteen natural variants and three fantasy hybrids.
- Run form-only, realization-only, Lawyer, native-render, and authoring-time evaluations.
- Exit: every accepted output has canonical ancestry, receipts, and visual approval.

### Phase 7 — Integration, PIR, and promotion verdict

- Integrate through the browser-safe PixelBrain Studio facade.
- Run SCDL, AMP, packet, isolation, security, and visual gates.
- Write a PIR reporting exact successes, failures, time savings, and unresolved limits.
- Exit: Angel explicitly accepts or rejects promotion of SCD128 core into later asset-family workflows.

## 21. QA and Falsifiers

The design is falsified or held at the tree stage if any of the following occurs:

- palette-only changes alter FORM64;
- a bank imports or reads the other bank;
- the Lawyer silently modifies, fills, or normalizes witness evidence;
- a quarantined preview enters corpus enumeration or AMP derivation;
- identical inputs produce different packets, receipts, SCDL, or pixels;
- different full slot digests collide at a truncated block and are accepted as identical;
- a natural variant is recognizable only by color rather than form;
- a hybrid looks assembled from pasted parent parts rather than governed by a coherent growth law;
- a Tree AMP reproduces master coordinates instead of generating within declared ranges;
- projected SCDL loses semantic layer separation;
- the fourteen natural variants do not reduce median hands-on time by at least 50%; or
- tree-specific vocabulary must be embedded in the SCD128 core to make the pilot work.

Required verification includes:

- fixed-width parser/generator round trips;
- 100-iteration determinism tests;
- SCD64 before/after differential tests;
- forbidden-field mutation tests for both banks;
- dependency-graph isolation checks;
- receipt tamper and stale-policy tests;
- quarantine admission attacks;
- exact native-pixel render inspection;
- multi-scale nearest-neighbor preview inspection;
- semantic-layer ingestion checks in Pixel-Art Studio; and
- an independent PDR/PIR review before cross-family promotion.

## 22. Success Criteria

The tree pilot is successful only when:

- all seven original masters are canonical and fully evidenced;
- SCD128 generation is deterministic and SCD64 remains unchanged;
- FORM64 and REALIZATION64 isolation is mechanically enforced;
- the Lawyer is the sole cross-bank adjudicator;
- canonical and laboratory paths cannot be confused;
- no quarantined evidence reaches derivation;
- fourteen unseen natural variants and three original hybrids are accepted;
- variants preserve family identity through form before color;
- hybrids are fantastical but structurally plausible;
- descendant authoring is at least twice as fast by the recorded median hands-on measure;
- approved output projects to valid, editable semantic SCDL v2; and
- the PIR contains enough evidence for Angel to decide whether SCD128 becomes a standard PixelBrain workflow stage.

## 23. Assumptions and Unknowns

### Measured repository facts

- Existing SCD64 is a 64-character, eight-block hashed semantic fingerprint with fixed block comparison and domain registries.
- SCD64 is not a reversible asset geometry packet.
- SCDL v2 and PixelBrain already have separate compiler, packet, AMP, layer/surface, and Studio ingestion responsibilities that SCD128 must not replace.
- The repository currently contains no SCD128 protocol or name collision.

### Approved architectural judgements

- SCD128 is a new art-specific sibling, not an SCD64 domain extension.
- It contains two sealed 64-character witnesses.
- The banks never communicate.
- The deterministic Lawyer is their only composition authority.
- Canonical output fails closed; diagnostic preview is permitted but quarantined.
- Diagnostic previews may teach the human but never Scholomium Ink.
- The first corpus is seven project-authored tree masters.
- Later families share universal roles but require separate vocabularies and policies.

### Unknowns to resolve through the pilot

- Whether eight slots per bank are sufficient without dishonest field packing.
- Which canonical tree categories and parameter ranges survive unseen-variant testing.
- Whether local edge samples can preserve realization evidence without leaking global structural labels.
- Whether exact block equality is useful for family discovery or a bank-local parameter-distance comparator is also needed.
- How much authoring-time reduction the first deterministic Tree AMPs actually achieve.
- Whether the durable per-layer surface IR is the correct evidence seam after its current implementation and review finish.

Unknowns remain `unbound` until measured. They are not guessed into the canonical vocabulary.

## 24. Law and Schema Evaluation

No VAELRIX law change is required to authorize this design. Existing bytecode-first, determinism, schema-sovereignty, adapter, immutability, and Sovereign Editor laws already govern it.

Implementation does require additive schema registration in `SCHEMA_CONTRACT.md`. That registration must preserve existing SCD64 contracts and clearly state that compact SCD128 blocks are addresses over decoded evidence, not substitutes for that evidence.

## 25. Implementation Authorization Gate

This PDR records an approved conversational design, but the written document must be reviewed by Angel before implementation planning begins. After written approval:

1. create a separate implementation plan;
2. assign schema/core, implementation/test, art-authoring, and optional UI ownership explicitly;
3. recheck the live dirty worktree and the completed state of the per-layer surface IR;
4. implement Phase 0 before authoring corpus-dependent code; and
5. stop at the tree-pilot promotion verdict rather than automatically expanding to other families.
