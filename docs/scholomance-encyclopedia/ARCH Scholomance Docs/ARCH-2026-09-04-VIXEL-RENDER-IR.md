# ARCH-2026-09-04-VIXEL-RENDER-IR

## Bytecode Search Code
`SCHOL-ENC-BYKE-SEARCH-VIXEL-RENDER-IR`

## Status
**ARCHITECTURE — RATIFIED 2026-09-04.** Engine canon: Codex. Schema registration (`SCHEMA_CONTRACT.md` 1.48): Codex. Immunity coupling (rule `LINEAGE-0F0D`): Codex. Rendered at the direction of the 2026-09-04 VIXEL verdict's §3.1/§4.2 finding — the WARN-bordering-CRIT that a 200+-test, physically-motivated rendering engine had no canon document an implementer or auditor could point to as its specification of record. This entry is that document.

## Origin

The Vixel Render IR (VRI) engine was built and debugged across multiple sessions, judged twice (`VERDICT-2026-09-03-VIXEL-SYSTEM.md`, `VERDICT-2026-09-04-VIXEL-SYSTEM-POST-REMEDIATION.md`), and both times the judgment recorded the same structural gap: real engineering, no canon. The 2026-09-04 verdict named this the finding holding the grade at B and prescribed the remedy — a PDR or `ARCH-*` entry that names the engine's own files in its own Target Integration Area, not as a forward reference and not scoped out (the wiring PDR `2026-09-03-vri-scdl-wiring-pdr.md` had deliberately excluded `codex/core/pixelbrain/vixel/` from its coverage). This is the entry that removes the exclusion.

## Target Integration Area

This canon entry specifies **the VRI engine itself**. Every path below is in scope, directly:

| Path | Role |
|---|---|
| `codex/core/pixelbrain/vixel/vri-schema.js` | `PB-VRI-v1` frozen scene schema, `PB-STROKE-v1` frozen contour contract |
| `codex/core/pixelbrain/vixel/vri-compiler.js` | Packet → VRI scene lowering; lighting model; quantization specs; `collectPaletteCoverage`; synthetic relief (`PB-VRI-RELIEF-v1`) |
| `codex/core/pixelbrain/vixel/vri-renderer.js` | Deterministic scene → RGBA renderer; passes 1–7; `collectRenderedPaletteCoverage` |
| `codex/core/pixelbrain/vixel/stroke-extractor.js` | Discrete contour extraction (`PB-STROKE-v1`) |
| `codex/core/pixelbrain/vixel/stroke-stylizer.js` | Role → fixed treatment seam |
| `codex/core/pixelbrain/vixel/index.js` | Public API; `renderCoordinatesVri` — the shared compile→render step every bridge below calls instead of hand-assembling a packet |
| `codex/core/pixelbrain/asset-pipeline.js` | `PB-ASSET-PIPELINE-v1` composition boundary; `PB-ASSET-LINEAGE-v1` chain; `verifyLineage` |
| `codex/core/pixelbrain/lineage-verify.js` | Dependency-free lineage vocabulary + `verifyLineageChain` (shared with Layer-1 immunity) |
| `codex/core/pixelbrain/construction-to-scdl.js` | `PB-CONSTRUCTION-SCDL-v1` geometry derivation (`CONSTRUCTION_LINK.DERIVED`) |
| `codex/core/pixelbrain/scdl/scdl.cli.js` | Production Door A: `--shade vri` (`--strokes`, `--relief`, `--lineage`) |
| `codex/core/pixelbrain/item-foundry.js` | Door B: `renderBundleVri`, opt-in via `forgeItemAsset(spec, { includeVri: true })`. Real materials (part fill declarations), real ramps. |
| `codex/core/pixelbrain/character-foundry.js` | Door C: `renderCharacterDirectionVri`, wired into `ActorForgeLab.tsx`'s "VRI Preview" toggle. **Honest limit, measured by rendering and comparing:** character cells carry no `material` and no vector/SDF identity (form-shading is baked into `color` at fill time), so this door is a rasterizer-swap preview, not a lighting or material upgrade — synthetic relief and the stroke overlay are visibly inert on it today. See the doc comment on `renderCharacterDirectionVri` for the measured comparison. |

All contracts above are registered in `SCHEMA_CONTRACT.md` version 1.48 (2026-09-04) with TypeScript shapes and invariants.

**Not the same "Vixel" as:** `src/lib/vixel-lattice/` (`VixelField` / Photonic Feel fusion — pixel grid + Wand vector paths, driven by `scripts/wand-vixel-pipeline.mjs` / `npm run vixel:pipeline`, further consumed by `src/lib/photonic-retina/`). Same word, unrelated system, no cross-reference between them today. If a future task wants VRI shading and lands in `vixel-lattice` instead, that's this naming collision — see the disambiguation note atop `vixel-fusion.js`.

## Anatomical Map

```
SCDL source (geometry, parts, materials)
   │  compileSCDL (grammar + pass pipeline, strict by default at the boundary)
   ▼
SCDL packet (coordinates with analytic vector identity)
   │  compileVRI (PB-VRI-v1)
   │    · geometry layer (SDF-backed forms)
   │    · texture fields (deterministic, seeded per material)
   │    · lights (TO-LIGHT convention), atmosphere, quantization spec
   │    · optional synthetic relief (PB-VRI-RELIEF-v1) for flat cells
   │    · provenance: authored palette coverage, unrendered declarations
   ▼
VRI scene (frozen, content-addressed checksum)
   │  renderVRI (deterministic, scale-invariant passes)
   │    1 geometry (fill vs band coverage; interiorFill for filled discs)
   │    2 texture · 3 marks · 4 lighting (multiplicative, reference-normalized)
   │    5 atmosphere · 6 quantization (back onto authored ramps)
   │    7 raster patches (curated pixels, last word)
   │    · rendered palette coverage (post-lighting surface measurement)
   │    · optional stroke overlay (PB-STROKE-v1, fixes boundary tearing)
   ▼
RGBA raster (+ provenance)
```

The composition boundary (`compileAsset`) runs construction (gate, or gate + derivation), gene projection, SCDL, VRI, and raster — and records a **lineage**: construction checksum → packet id → scene checksum → raster digest, one row per frame.

## Law Compliance

- **Law 6 (Determinism):** no RNG anywhere in the engine; textures seeded by `fnv1aNum(material)`; dither is position-decided; repeated compiles are byte-identical (pinned by test). The lineage chain is direct evidence: `verifyLineage()` re-derives every downstream identity.
- **Refusal is not a visual warning:** `compileAsset` defaults `strict: true` (ruled 2026-09-03, commit `2c92a5d5`); unknown materials refuse rather than silently falling back; frame-scoped failures are contained, never swallowed.
- **ByteCode Error System:** pipeline refusals carry `PB-ERR-v1` payloads; lineage corruption is `IMMUNE-0F0D` via the innate layer.

## The Synthetic-Relief Question — Resolved by Building

The 2026-09-03 verdict praised a "synthetic relief" technique; the 2026-09-04 verdict's grep found **zero implementation anywhere** and corrected the record — this project's second instance of the `citation-with-nothing-behind-it` class. The 09-04 verdict asked the arbiter to rule on adoption. The ruling, embodied rather than merely stated: **the technique now exists** (`PB-VRI-RELIEF-v1`, `vri-compiler.js`, opt-in, 10 tests including two controls), built from the original description: rank each flat cell's colour by its position in its own material value ramp, center the rank so mid-tones stay flat, project the tilt onto the key light's in-plane direction. Its limits are documented as measured, not inflated: it is a tone-based mechanism — it gives authored value contrast physical grounding under the lighting pass; it does not manufacture spatial key-gradients on uniform regions, and its tests say so.

## Immunity Coupling

`verifyLineage` previously had zero innate consumers (verdict Immune Potential 4/10). Now:

- `--shade vri --lineage` exports a `PB-ASSET-LINEAGE-SIDECAR-v1` artifact.
- Innate rule `LINEAGE-0F0D` (`codex/core/immunity/innate.rules.js`) scans `-lineage.json` artifacts with `verifyLineageChain` — the same verifier the pipeline uses, imported from the dependency-free `lineage-verify.js` (one source of truth; the innate layer stays light).
- Broken chains (corrupted digest, dropped frames, unknown construction link, derived-link-without-partsChecksum) emit `IMMUNE-0F0D` with a concrete mismatch list and repair key `repair.asset-lineage.recompile`. 14 tests pin both directions.

## Invariants

1. The VRI scene checksum covers scene content (layers, lights, atmosphere, quantization, intents), not provenance — diagnostic fields may grow without breaking identity.
2. Light `direction` is a to-light vector. Lighting is multiplicative modulation normalized against the unsculpted viewer-facing reference — a flat cell renders at its authored colour.
3. Authored-surface coverage (`surface: "authored"`, compile-time) and rendered-surface coverage (`surface: "rendered"`, post-lighting) are distinct measurements and must never be conflated. The 2026-09-03 verdict's `paletteCoverage` WARN was exactly this conflation; the tag is the guard.
4. Filled circles mark interior cells (`interiorFill`); Pass 1 gives them half-space coverage. Stroke ops keep band coverage. The pommel of `lightning-sword.scdl` renders filled at every scale including 1x (the 09-04 verdict's INFO item, root-caused deeper than diagnosed).
5. `PB-STROKE-v1` is frozen; reserved slots stay uninterpreted until a v2.
6. Construction derivation (`PB-CONSTRUCTION-SCDL-v1`) refuses to compile nothing: zero derived parts is an error, never a silent empty asset. Colour is never defaulted.

## Open Surfaces (honest)

- **Door B is opt-in.** `item-foundry.js` reaches VRI via `renderBundleVri()` / `forgeItemAsset(..., { includeVri: true })` — additive, lineage-recorded, standard outputs proven unperturbed. No production caller forces it yet; adoption is a per-caller decision, exactly as Door A's `--shade vri` is.
- Rendered-coverage attribution is last-paint-wins per logical cell; pixels outside all geometry are honestly unattributed.
- Foundry cells carry baked shading and no SDF normals; VRI renders them as flat cells (reference-normalized) and synthetic relief may ground their values. This is a deliberate non-fabrication: no vector identity is invented for cells that have none.
