# Verified Asset Pipeline White Paper — Design

**Status:** Approved

**Date:** 2026-07-29

**Deliverable:** `docs/scholomance-encyclopedia/Scholomance White Papers/VERIFIED_ASSET_PIPELINE_WHITE_PAPER.md`

## Purpose

Create a white paper that explains Scholomance's asset pipeline to a combined
audience of stakeholders, technical artists, and engine contributors. The
document will begin with an executive explanation and then descend into the
contracts, stage boundaries, deterministic behavior, and reproducible evidence.

## Evidence Standard

The paper will claim only behavior supported by the current repository:

- implemented source code;
- ratified contracts that are exercised by current implementation;
- focused automated tests executed during preparation; or
- explicit repository law that constrains the implemented path.

Approved but unimplemented design will not be described as current capability.
In particular, the ontological art-direction PDR's durable ledger, capability
retrieval, interactive approval adapter, and Feel-warning loop are outside the
verified runtime scope unless independent implementation evidence is found.

## Primary Sources

- `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-ontological-art-direction-pipeline-pdr-revised.md`
- `docs/scholomance-encyclopedia/PDR-archive/2026-07-25-geometric-construction-solver-pdr.md`
- `codex/core/pixelbrain/vixel/vri-compiler.js`
- `codex/core/pixelbrain/vixel/vri-renderer.js`

Supporting implementation evidence may be drawn from the adjacent VRI schema,
public index, and focused test suites when necessary to verify a claim.

## Framing

Use a proof-chain architecture:

```text
authored asset intent
  -> optional constrained geometric construction
  -> SCDL/scene coordinates and material semantics
  -> VRI compilation
  -> ordered deterministic render passes
  -> RGBA output
```

The geometric construction solver and VRI compiler are distinct boundaries.
The paper must not imply that `compileVRI()` directly invokes the solver.
Construction is an upstream coordinate-authoring path; VRI is the render
intermediate representation that determines how accepted geometry looks.

## Proposed Structure

1. Executive thesis and production value
2. Verified scope and terminology
3. End-to-end proof chain
4. Geometric construction solver
5. SCDL-to-VRI compilation
6. VRI layer model and material semantics
7. Deterministic RGBA rendering
8. Art-gene influence and retained human authority
9. Identity, provenance, refusal, and reproducibility
10. Current limitations and non-claims
11. Contributor and technical-artist operating guidance
12. Verification record and source appendix

## Required Technical Content

The white paper will explain:

- the `PB-GEOMETRY-CONSTRUCTION-v1` packet, primitive vocabulary, constraint
  classes, post-transform verification, immutability, and SHA-256 identities;
- the default-off Wand construction boundary and PB-ERR-v1 refusal behavior;
- the distinction between SCDL's structural semantics and VRI's appearance
  semantics;
- `PB-VRI-COMPILE-v2` lowering into geometry, texture, mark, raster-patch,
  lighting, atmosphere, provenance, and checksum-bearing scene data;
- object, world, surface, and screen texture coordinate spaces;
- deterministic renderer ordering: geometry, texture, marks, lighting,
  atmosphere/grading, and final raster patches;
- scale behavior and the pure `(scene, scale) -> RGBA` contract;
- verified art-gene inputs: explicit coordinates, mark cells, and supported
  binding channels;
- the architectural rule that machines may preserve and project curated
  intent but may not claim autonomous aesthetic authority.

## Accuracy Boundaries

The paper will state current implementation limitations directly:

- VRI's displayed checksum is FNV-1a-based rather than the construction
  contract's full SHA-256 identity.
- VRI scene freezing is not presented as recursive immutability.
- the renderer does not currently implement every declared schema concept;
  for example, bloom and general mask/composite semantics are not claimed;
- scene-graph packets require caller-supplied lowered coordinates;
- unknown art-gene binding channels are ignored for forward compatibility;
- VRI compilation and rendering currently throw ordinary errors at their
  explicit refusal sites rather than advertising PB-ERR-v1 coverage.

These points are limitations, not roadmap promises.

## Verification Baseline

Preparation-time focused results:

- `tests/codex/core/pixelbrain/vixel/vri.test.js`: 64/64 tests passed.
- construction solver plus canonical asset suites: 122/122 tests passed.

The finished paper will include the exact commands used and will distinguish
focused evidence from a repository-wide QA run.

## Style

- Lead with plain-language outcomes.
- Use one compact architecture diagram and tables only where they improve
  contract comparison or stage mapping.
- Define project-specific terms on first use.
- Keep mythic language subordinate to technical precision.
- Avoid speculative claims, implementation promises, and marketing superlatives.

## Success Criteria

The paper is complete when a stakeholder can explain why the pipeline exists,
a technical artist can identify the correct authoring boundary, and an engine
contributor can trace a visible pixel back through verified contracts without
confusing implemented behavior with approved design.
