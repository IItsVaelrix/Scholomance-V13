# Blender Synthesis Bridge — Design

**Date:** 2026-07-30
**Status:** Design approved (Sections 1–3); implementation plan pending
**Scope:** PixelBrain (`codex/core/pixelbrain/`), video suite (`src/video/`), new bridge package
**Related:** `2026-07-29-defold-bridge-design.md` (the pattern this follows),
`SCHOLOMANCE_SEMANTIC_CORRESPONDENCE_REGISTRY.md` (the grading discipline)

---

## Organ Roles

Blender joins the existing organ set. Sovereignty partitions rather than conflicts.

| Organ | Role | Owns |
|---|---|---|
| PixelBrain | Visual Compiler | Assets, packet checksums |
| `VideoProjectPacket` | The Edit | Tracks, clips, keyframes, effect stack |
| **Blender** | **Synthesis Engine** | **Light, motion, volume** |
| Remotion | Visual Laboratory | Nothing — free to be wrong |

Blender holds authority over the physics PixelBrain has no organ for, and over
nothing else. Assets stay PixelBrain's, the edit stays the packet's.

**Remotion is retained and promoted, not deprecated.** It becomes the second
consumer whose receipt makes Blender's receipt falsifiable — the Pixi/Defold
relationship. Retiring it would leave one producer and one consumer, and a
comparison between them would prove nothing. Nothing in `src/video/editor/`
is discarded.

**"Blender is the app" without a second producer.** The addon's panels never
mutate `bpy` state as truth. They emit *intents*; the Node side mutates the
packet and re-seals; the addon re-projects. Thin client, producer authoritative.
The user sits in Blender; Blender does not own the edit.

---

## Verified environment facts

Established by inspection on 2026-07-30, not assumption.

- **Blender 5.2.0 LTS**, hash `fbe6228777e7`, built 2026-07-14, native linux-x64
  at `~/opt/blender` (symlink; version swaps underneath it).
- Embedded **Python 3.13.13**. `numpy 2.3.4`, `requests`, `urllib3`, `certifi`,
  `zstandard`, `asyncio`, `selectors` all present. **No `websockets`.**
  **No `pyopenvdb`** — the voxel-volume → OpenVDB grid wire is unavailable.
- Render engines: `CYCLES`, `HydraRenderEngine`. Scene default `BLENDER_EEVEE`.
- **Only one Cycles device exists**: `('AMD Custom APU 0932', 'CPU', False)`.
  `CUEW initialization failed`. GPU nondeterminism is out of the threat model
  because GPU rendering is unavailable, not because it was judged safe.
- Cycles defaults: `seed=0`, `use_animated_seed=False`, `samples=4096`,
  `use_adaptive_sampling=True`, `adaptive_threshold≈0.01`,
  `adaptive_min_samples=0` (auto), `denoiser='OPENIMAGEDENOISE'`,
  `use_denoising=True`, `sampling_pattern='AUTOMATIC'`.
- **Default view transform is `AgX`.** The `view_transform` enum is populated
  dynamically from the OCIO config — RNA reports only `['NONE']` while the live
  value reads `AgX`, so the setting cannot be validated by enumerating RNA.
- **`Scene.node_tree` is removed.** The compositor is `scene.compositing_node_group`
  (a `CompositorNodeTree`). `Scene.use_nodes` and `Material.use_nodes` are both
  deprecated with removal announced for 6.0.
- **`hasattr()` on `bpy.ops` always returns `True`** —
  `hasattr(bpy.ops.graph, 'total_nonsense_xyz')` is `True`. Capability probing
  must use `dir()` or `get_rna_type()`. Consequence found this way:
  **`bpy.ops.graph.sound_bake` does not exist**; audio-to-f-curve baking is
  `graph.sound_to_samples`.
- **RNA float properties are C float32**: assigning `0.1234567890123456789` to
  `object.location[0]` reads back `0.12345679104328156`.
- **ID custom properties preserve float64 exactly** (`0.14285714285714285`
  round-trips) and cap at **int32** (`2**31` raises `OverflowError`).
- **Datablock names silently collide-rename**: `materials.new("collide")` twice
  yields `'collide'`, `'collide.001'`. Names are *not* length-truncated (80 chars
  survived), so length is not a hazard but identity is.
- Attribute data types include `STRING`; `GeometryNodeInputNamedAttribute`
  accepts it, but **`ShaderNodeAttribute` outputs only `Color, Vector, Factor,
  Alpha`** — shaders cannot read string attributes.
- `bpy.app.timers` exists. `depsgraph_update_post` and `composite_pre/post`
  handlers exist.

---

## The Laws

### 1. One producer. The consumer verifies by string equality.

Inherited from the Defold bridge. The addon never computes a hash, never mints a
receipt, never re-derives truth. It decodes, verifies the seal by `==`, applies,
and reports a raw claim.

Corroborated mechanically: the scene data that matters — attributes, transforms,
node inputs — is float32, so a value that crosses into Blender is a different
number coming back out and cannot be rehashed to agreement. ID custom properties
are the documented exception (float64-exact) and are therefore where the seal,
the intern table, and the quantization scales ride. They are **carried, never
computed**.

### 2. Quantized integers are canonical.

Not a transport workaround. The integer *is* the value, with a declared
per-field scale. The float32 in `bpy` is derived and never authoritative, so
truncation cannot cause divergence. `SCENE_GRAPH` hashes integers both sides
agree on. Scales ride in custom properties. Every value must fit int32.

### 3. Colour policy is declared per wire.

| Policy | View transform | Use |
|---|---|---|
| `EXACT` | `Standard`, images `Non-Color` | PixelBrain rasters. Protects the value-sketch law (authored hex is an absolute [0,1] value sketch). Pixel-exact round trip is testable. |
| `SYNTHESIZED` | `AgX` permitted | Blender-generated light. No PixelBrain ground truth to preserve. |

A wire mixing both in one output is **refused**, not resolved.

### 4. Names carry no identity.

Packet IDs live in custom properties. Lookup is by custom property, never by
`.name`.

---

## Components

Mirrors the Defold component set.

| Component | Lang | Role |
|---|---|---|
| `blender-bridge/src/wire.ts` | TS | `toPythonWire(packet)` — projection against Blender's hazard set |
| `blender-bridge/src/receipt.ts` | TS | parse claim → mint receipt → cross-engine diff vs Remotion |
| `blender-bridge/src/intent.ts` | TS | panel intent → packet mutation → re-seal |
| `blender-bridge/src/render-scd64.ts` | TS | the `RENDER` SCD64 domain (below) |
| `addons/scholomance_pixelbrain/` | Py | decode, verify seal, apply to `bpy`, emit raw claim, dump pixels |

**Open question:** `VideoProjectPacket` lives in `src/video/editor/core/` while
the Defold precedent lives in `PolarisOS/packages/`. Bridge location undecided.

### Wire hazard set

Blender's hazards differ from Lua's. The projection is derived from them, not
copied from `toLuaWire`.

| Hazard | Lua had | Blender/Python has | Rule |
|---|---|---|---|
| empty collections | `[]` ≡ `{}` | not a problem | **drop** the `*Count` rule |
| nulls | `nil` ≡ absent | `None` is legal Python… | **keep** no-nulls — `None` on an RNA property raises `TypeError` |
| float precision | — | float32 truncation | integer-quantize; Law 2 |
| identity | — | silent collide-rename | Law 4 |
| enums | — | dynamically populated; invalid assignment raises | TS validates against a pinned allowlist; never enumerate RNA to validate |
| colour | — | AgX default + scene-linear | Law 3 |
| categoricals | — | shaders cannot read STRING | intern to `INT`, table in a custom property |

---

## Determinism: the SCD64 `RENDER` domain

### Measured baseline

Six variants, 160×160, 64 samples, CPU, seed 7, two runs each, pixel payload
hashed (not the file):

| Variant | Result |
|---|---|
| threads 1 / 4 / 8, no adaptive, no denoise | pixel-identical run-to-run **and to each other** — thread-count invariant |
| denoising on (OIDN) | pixel-identical run-to-run; changes pixels as expected |
| adaptive sampling on | pixel-identical run-to-run **and identical to adaptive off** |

**Cycles CPU is bit-reproducible on this machine.** The adaptive-sampling row is
an `INERT` result — a declared input changed and the output did not move. Benign
explanation holds (`adaptive_min_samples=0` auto-derived from
`adaptive_threshold=0.01` never culls at 64 samples), but the mechanism reported
it unprompted, which is the argument for building it.

### The container law

All observed nondeterminism was **container, not content**: 7 bytes differing in
the EXR header — a wall-clock timestamp and a render-duration string.

Therefore the checksum is taken over a **canonical pixel projection**, never the
render file. A file-level hash is a check that cannot *pass* — it fails 100% of
the time for reasons unrelated to the image, which by §7.5 of the registry is
worse than a check that cannot fail, because it trains everyone to switch the
gate off.

Mechanism: **Blender emits, TypeScript hashes.** The addon writes a raw float32
pixel dump beside the EXR — metadata-free by construction — and the bridge
hashes that. Python interprets nothing; dumping bytes is transport.

### Slot mapping

Reuses the existing eight-slot wire contract, exactly as `ART_SLOT_ALIASES`
already establishes as precedent. Seven slots are causes; the eighth is the
effect.

| Physical slot | ART alias | `RENDER` alias | Canonical derivation covers |
|---|---|---|---|
| BUGCLASS | ART_CLASS | `SYNTH_CLASS` | version byte + content class: `RASTER` \| `SYNTHESIZED` \| `VOLUME` \| `SIMULATED`. This is the **verification-rule axis** (endpoint vs chained), *not* the colour axis — colour policy lives in `COLOR_LAW`. The two are independent: a `SIMULATED` render can carry either colour policy. |
| COORDSYS | CANVAS_SYS | `FRAME_SYS` | resolution, pixel aspect, frame index, camera matrix (quantized) |
| INVARIANT | DOCTRINE | `ENGINE_LAW` | Blender version + build hash, engine, device |
| MAGNITUDE | VALUE_RAMP | `LIGHT_BUDGET` | seed, samples, adaptive flag + threshold, bounces, clamping, **shutter bounds + time-sample count** |
| MASKING | OCCLUSION | `DENOISE` | denoiser type, input passes, on/off |
| GATE | APPROVAL_GATE | `COLOR_LAW` | `view_transform`, look, display device, format, colour depth |
| PROPAGATE | PROJECTION_PATH | `SCENE_GRAPH` | canonical scene projection, node-tree hashes, declared seeds, PixelBrain seals consumed |
| VERDICT | CURATOR_VERDICT | `PIXEL_RECEIPT` | sha256 of the raw float32 pixel dump |

### Verdict lattice

`compareSCD64ByBlocks` becomes a diagnosis because of the cause/effect asymmetry.

| `differentBlocks` | Verdict | Meaning |
|---|---|---|
| none | **REPRODUCED** | determinism holds |
| `PIXEL_RECEIPT` only | **NONDETERMINISTIC** | same causes, different pixels — unseeded entropy in the render path |
| a cause + `PIXEL_RECEIPT` | **RESYNTHESIZED** | expected; `differentBlocks` names which cause |
| a cause, **not** `PIXEL_RECEIPT` | **INERT** | declared input is unwired or a no-op |

`INERT` is the mechanical falsifier for this repository's documented
declared-but-unimplemented pathology (bloom, masks, `HARD_LIGHT`, the missing
solver call) — all previously found by hand.

### Why this gate can fail

Six slots are declared by the producer in TS. The seventh is measured from
pixels Blender actually produced. Python computes neither. The gate is therefore
not comparing a generator against its own output. `NONDETERMINISTIC` and `INERT`
are verdicts a trivially-passing system cannot manufacture — demonstrated, since
`INERT` fired on the first real data.

### On SCR-023

`compareSCD64` returning a `similarity` float resembles the checksum-as-embedding
false friend. It is not one: each slot is
`sha256(its own disjoint canonical string).slice(0,8)`, so each slot's avalanche
property is contained *inside* the slot. `matchingBlocks` counts agreement over
eight independent categorical facts — Hamming distance over a **structured
record**, not over an avalanche digest.

SCR-023's warning still binds: you cannot cluster or interpolate on that number.
What is preserved is **localization**, not distance. The design leans on
`differentBlocks`; `similarity` is incidental. Naming it `similarity` is what
makes it look like the false friend.

---

## Path-dependence classification

### Measured

Cold vs warm test — evaluate frame 24 directly, versus after stepping frames
1..24. A conservative process is unaffected; a path-dependent one diverges.

| Hazard | Measured | Class |
|---|---|---|
| Motion blur | `cold == warm == 673a690b…`, repeats identical | **conservative** |
| Geometry nodes | `cold == warm == 91220804…`, 8640 verts | **pure DAG** |
| Simulation caches (rigid body) | cold z=`3.000000` vs warm z=`−1.466180`, each reproducible | **path-dependent** |

**An endpoint checksum is valid exactly when the process is conservative.**

### The sim result is a correctness bug class

Cold-starting frame 24 returns the *un-simulated* state and Blender reports
nothing wrong. Since distributing a frame range across workers is the normal way
to render a sequence, **any distributed render of simulated content is silently
wrong** — no error, plausible-looking frames.

### Consequences

1. **Motion blur and geometry nodes need nothing new.** Motion blur folds into
   `LIGHT_BUDGET` and verifies against `PIXEL_RECEIPT` as-is. Geometry nodes fold
   into `SCENE_GRAPH` (node-tree hash + declared seeds).

2. **Simulation caches get a chained receipt**, `digest₀` seeded from the packet's
   own seal:

   ```
   PIXEL_RECEIPT(N) = sha256(pixel_dump_N ‖ digest_{N−1})
   digest_0        = the sealed packet's own seal
   ```

   Frame N cannot be sealed without N−1, so a cold-started worker has nothing to
   fold and must **refuse** rather than emit a confident wrong frame. Divergence
   localizes to the *first* bad frame. No new primitive: a hash chain (SCR-002,
   `ID`) plus SCR-005's monotonic gate for ordering.

3. **New slot semantic, not a new slot.** `SYNTH_CLASS` gains `SIMULATED`, which
   tells a consumer *"this receipt is chained; endpoint verification is invalid
   here."* The checksum declares its own verification rule inside a preserved
   wire contract.

4. **Conserved totals are a screen, not a seal.** Total energy / centre of mass /
   particle count is order-independent and catches gross divergence cheaply, but
   many distinct states share a total. Useful as an early-out. Never the gate.

5. **Classification is mechanical, not a maintained list.** The cold/warm test
   *is* the classifier. **No Blender feature enters the suite until it has passed
   the cold/warm classifier and had its class recorded.** This keeps failing on
   new features indefinitely.

---

## Asset ingest is attribute-first

The real `.pbrain` coordinate (verified against `output/holy_fire_claymore.pbrain`,
`FNV-1a-32` = `6DB23A1A`, 788 coordinates, canvas 64×112, `gridSize 1`) is a
24-field semantic record, not a pixel:

```
color #DCB430 · preSquareColor #D4AF37 · emphasis 0.1428… · energies[{type:2, value:0.1847}]
partId "blade" · shading "core" · isRim true · isMotif false · motifRole null
localContrastDelta 0.1748 · squareAmpClass "edge" · squareAmpIntensityRating 0.6517
nx 0 · ny 0 · x 30 · y 8 · z 0 · slot 1 · source "sketch" · structuralEnergy 0.1847
```

So the correspondence to build is **per-coordinate semantic record ↔ Blender
attribute field** — both are "a named value per domain element," and Geometry
Nodes is a field-processing engine. This is what makes the work *PixelBrain in
Blender* rather than an importer: every PixelBrain semantic becomes a
first-class Blender field readable by GN and shaders.

Rules:

- Positions from `x, y, z`. Every scalar becomes a named attribute
  (`pb_emphasis`, `pb_structural_energy`, `pb_local_contrast_delta`, …), crossing
  as int32 under Law 2 with a per-field scale — `emphasis` is float64 in the
  packet (`0.14285714285714285`), and the quantized integer is what both sides
  hash, so the float32 the attribute finally holds is derived and never truth.
- Categoricals (`partId`, `shading`, `motifRole`, `squareAmpClass`, `source`)
  intern to `INT`, table in a custom property — because shaders cannot read
  `STRING`, not because STRING is unavailable.
- `nx, ny` carry **no `nz`**. Reconstructing `nz = √(1−nx²−ny²)` assumes unit
  length *and* a sign convention: a declared binding, never an implicit default.
- `color` vs `preSquareColor` are two colour states. `EXACT` policy must declare
  which is truth.
- `energies[]` is the general 8-channel vector; `structuralEnergy` is a
  denormalized copy of type 2. Only STRUCTURAL appears in this packet.

---

## Semantic organs

**The bridge carries the energy vector; it does not interpret it.** All eight
`ENERGY_TYPES` (`RESONANT, PHOTONIC, STRUCTURAL, THERMAL, KINETIC, ENTROPIC,
SHIELDING, RADIANT`) cross as raw named attributes.

Any mapping onto a shader input is a **declared, graded binding**.
`PHOTONIC → emission` is arguably structural; `THERMAL → blackbody` is `FA` at
best; `STRUCTURAL / KINETIC / SHIELDING / RESONANT` have no optical analogue at
all. Implicit defaults here would recreate SCR-017's forbidden wire (material
name → procedural texture, graded `FA`, explicitly not to be used for code
generation) in a new place.

**School palette → node group** from `SCHOOL_PALETTE` (`SONIC, PSYCHIC, ALCHEMY,
WILL, VOID, default`, each `{primary, accent, glow}`), with the transfer function
recorded in `COLOR_LAW`.

---

## Slice 1 scope

Boundary + ingest + determinism + minimal semantic organs.

1. Addon skeleton; HTTP + `bpy.app.timers` transport; seal verification by `==`;
   error taxonomy; Python-side tests.
2. `toPythonWire` with the hazard rules above; one `.pbrain` packet ingested
   attribute-first.
3. `RENDER` SCD64 domain; raw pixel dump; receipt minting in TS; the four-verdict
   lattice; cold/warm classifier as an admission gate.
4. Energy attributes carried losslessly; school-palette node group; exactly one
   graded binding (`PHOTONIC → emission`) labelled with its strength.

Deliverable: one PixelBrain asset crosses into Blender, renders twice to an
identical pixel receipt, mints a receipt, and reports `REPRODUCED`.

---

## Registry entries to add

Per §2's protocol. Default is `FA` until a tested implementation demonstrates
structure preservation.

- **SCR-026: Reproducible build ↔ render receipt determinism.** Evidence: the
  six-variant pixel-identity result.
- **SCR-027: Structured-record Hamming distance ↔ SCD64 block comparison.** `SC`,
  conditional on slot independence. Cites SCR-023 as the contrast case.
- **SCR-028: Conservative vs non-conservative field ↔ endpoint vs chained
  checksum validity.** `SC`. Evidence: the cold/warm measurements.
- **SCR-029: Attribute field ↔ per-coordinate semantic record.** Proposed `SC`;
  promotion requires the slice-1 ingest to demonstrate round-trip fidelity.

Also: `src/core/scd64` is the implementation and `src/diagnostics/scd64` is UI
only. This resolves the `AMBIGUOUS` verdict §7.2 rule 2 predicts for SCR-002's
bare `scd64/` citation.

---

## Verification limits

- Determinism measured on **one scene**, 160×160, 64 samples, **CPU**, one
  machine, one build. Not a claim about other scenes or resolutions.
- Path-dependence measured for **rigid body only**. Cloth, fluid, particles,
  softbody, boids and dynamic paint are unclassified and may be nondeterministic
  *as well as* path-dependent. Rigid body happened to be reproducible; that is
  not a promise about the others.
- `ENGINE_LAW` pinning the build hash means a Blender upgrade correctly
  invalidates every receipt. Honest, and expensive.
- Absolute concept-chemistry scores are **not** usable here: every reaction lands
  `UNSTABLE` against `STABLE_MIN=0.55`. Scores are comparable within a run, never
  across question domains. See *Concept chemistry as an ordinal instrument* for
  why this is a calibration limit rather than a validity failure.
- No GPU path exists to test, so no claim is made about one.

---

## Concept chemistry as an ordinal instrument

`scripts/concept-chem-determinism.mjs` ranked ten candidate mappings *before* the
cold/warm measurements existed. It is therefore an out-of-sample test of the
engine, and it passed:

| Hazard | Winner | Independent measurement |
|---|---|---|
| simulation caches | `sim/markov-chain` (0.2442) | path-dependent; a chained per-frame digest is exactly what is required — **confirmed** |
| motion blur | `blur/summation-order` (0.1878) | bitwise reproducible ⇒ accumulation order is pinned — **confirmed** |
| geometry nodes | `geonodes/pure-dag` (0.1180) | pure DAG, `cold == warm` — **confirmed** |

Taking the best control (`control/false-friend`, 0.1073) as the threshold gives
**8/8 correct classification** across every reaction for which ground truth
exists: all six `CONFIRMED` reactions score above it, both `REFUTED` reactions
below it, zero errors.

**That 8/8 is plausibly overfit and must not be read as a benchmark.** The same
author wrote both the 24-document corpus and the reaction texts. When the
grounding channel was replaced with the real encyclopedia index
(`grounding-index.js`, 59 documents, 6,475 tokens) the same labelled set scored
**6/8** — winners still 3/3, but two boundary errors appeared
(`geonodes/seeded-field` REFUTED rose above the control; `blur/temporal-quadrature`
CONFIRMED fell below it). The corpus-grounded 6/8 is the more honest number.

The comparison that is apples-to-apples — same corpus, grounding formula varied —
is the one to trust:

| Grounding variant | Boundary |
|---|---|
| corpus, attestation-only | **6/8** |
| corpus, composite (`0.7·attest + 0.3·jaccard`) | 5/8 |
| corpus, signed/centred jaccard | 6/8 |

Two consequences:

- **`synthesize()` discards the composite.** `groundingScore()` returns
  `0.7·attest + 0.3·jaccard`, but the caller reads `attestA`/`attestB` and
  recomputes the attestation-only mean — verified: composite `0.6963` vs used
  `0.6534`. The 30% co-occurrence term is `INERT` in every feasibility score.
  **Do not wire it**: doing so scores 5/8, worse than leaving it dead. Delete it
  or mark it explicitly non-scoring.
- **`INERT` therefore requires judgement, not reflex.** A declared input that
  cannot move the output is a finding; whether activating it is an improvement is
  a separate, measurable question. This qualifies the verdict lattice above:
  `INERT` reports "unwired," never "wire it."

Why co-occurrence cannot discriminate here: document-level jaccard **saturates**
(0.438–0.837 across the labelled set, false friend at 0.667 — mid-range). With 59
documents, any two multi-word technical sentences touch most of the corpus. The
granularity is wrong; paragraph windows or PMI over token pairs would be needed.

Structurally, **attestation is blind to false friends by construction** — a false
friend is attested on both sides. The only channel that can express repulsion is
`bond`, which carries the smallest weight (`W_BOND=0.15`) while the blind channel
carries the largest (`W_GROUND=0.65`). `bond < 0` is not a safe gate either:
`blur/conservative-field` is −0.0069 and CONFIRMED, against the false friend's
−0.0430. The ~6× magnitude gap suggests a threshold exists; three negative data
points cannot locate it.

**The engine is ordinal, not a calibrated classifier**, and must be judged on the
matching criterion. Two gates are wrong and were both tried:

- *"all controls `UNSTABLE`"* cannot fail when the whole field is `UNSTABLE`.
- *"worst candidate beats best control"* assumes every authored hypothesis is
  good. It can only ever indict the corpus, never the thinking. A discriminating
  engine **must** be free to rank a bad hypothesis below nonsense — and here it
  did: `geonodes/phase-space` and `geonodes/seeded-field` fell below the control
  line and were subsequently the only two hypotheses the measurement refuted.

The correct gate is *per-hazard winner beats every control*.

**Methodological consequence:** ship a false-friend control with every question
rather than trusting a global `STABLE_MIN`. A global threshold cannot survive a
change of question domain; a control travels with the question, and because its
grounding is computed by the same function as the candidates', grounding drift is
common-mode. Recalibrating `W_GROUND` should therefore move every score without
disturbing the 8/8 boundary — which makes this script a regression test for any
change to the grounding channel.

One further durable result: `control/law-violation` carried the **highest bond
energy of all thirteen reactions** (0.2967) and was zeroed only by `lawGate`.
Bond energy is not evidence; the law gate is load-bearing (SCR-012 earning its
`SC`).

---

*The codebase is the territory. When the bridge and the territory disagree, the
territory wins.* 🜏
