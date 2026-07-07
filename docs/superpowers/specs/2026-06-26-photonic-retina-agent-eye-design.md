# Photonic Retina as Agent Eye — Change-Detection Perception with Placement & Shadow Memory

**Date:** 2026-06-26
**Status:** Design (pending implementation plan)
**Related:** `docs/scholomance-encyclopedia/PDR-archive/Photonic Retina PDR.md`

## Problem

The procedural / ML asset-generation pipeline re-scans the **entire** canvas every
pass to decide what to do. It has no spatial memory, so each tick it re-reads all
cells just to discover which ones are unsettled. This is wasted compute and makes
the loop slow and non-incremental.

We already have:

- **Color memory** — `qbit-phosphorylation.js` deterministically collapses a cell's
  energy + SDF depth into a committed anchor color (rim → core). A cell "remembers"
  its resolved color.
- **A change signal** — the Photonic Retina (`src/lib/photonic-retina/`) encodes
  visual input into a deterministic `PhotonicVectorPacket` and can diff two packets
  via `createPacketDelta` to produce a per-cell "what changed" signal.

What we lack:

1. A **placement** equivalent of color memory — cells don't remember that their
   *coordinate placement* is settled, so placement is re-derived every pass.
2. A way for the pipeline to perceive **only what changed** and trust committed
   cells as "already placed."
3. Awareness of **shadow / light** changes, which are *non-local*: a committed
   cell's lighting can change because a neighbor moved, even though the cell's own
   value did not.

## Goal

Turn the Retina into the procedural pipeline's "eye": each tick it emits a compact,
deterministic **PerceptionFrame** describing the narrow set of cells the pipeline
must attend to (`attendMask`), so the pipeline processes only changed-or-unsettled
cells instead of re-scanning the whole canvas — while correctly re-waking committed
cells whose **shadows** shifted.

## Non-Goals

- No change to Retina core encoding (`retina-encoder.js`, `retina-adapter.js`) — it
  stays a pure deterministic encoder per its PDR (Non-Goals §5, determinism §11).
- No canvas-rendering changes; this is an ingestion/perception layer only.
- No LLM/text digest output — the consumer is the procedural/ML pipeline and reads
  numeric typed arrays. (A text digest for the cockpit LLM agent is a possible future
  channel, explicitly out of scope here.)
- No real optical physics; shadow is the existing `shadow-amp` derivation, not new
  lighting simulation.

## Architecture

Approach **B** (lattice-side memory, Retina stays pure). Two new files plus an
assembler; the Retina core and the existing color commit are reused unchanged.

```
lattice coords ──► Retina.encode ──► packet ──► createPacketDelta(prev,curr) ─┐
   (existing)        (existing)                      (existing)               │
                                                                              │
qbit energy/SDF ──► [NEW] placement-commit ──► committed bitmask ─────────────┤
   (existing)         (deterministic)            (deterministic)              │
                                                                              ▼
shadow-amp field ─► [NEW] shadow-field delta ──► shadowDelta ──► [NEW] perception
   (existing)         (non-local light channel)                    assembler
                                                                              │
                                                                              ▼
                                                      PerceptionFrame { attendMask, ... }
                                                                              │
                                                                              ▼
                                                          procedural / ML pipeline
                                                          (processes attend-only)
                                                                              │
                                                       commits new placements ─┘  (feeds next tick)
```

### Unit 1 — `codex/core/pixelbrain/qbit-placement-memory.js` (geometry channel)

Sibling of `qbit-phosphorylation.js`, built in the same deterministic shape as
`buildKinase` / `COLLAPSE_THRESHOLD`.

- Input: per-cell placement evidence — snap stability (did the lattice snap move the
  coordinate this pass?), symmetry agreement, and energy ≥ threshold.
- Output: `{ committed: boolean, confidence: number, generation: number }`.
- Determinism: no `Date.now`, no `Math.random`; `generation` is an integer counter
  passed in by the caller, never wall-clock. Identical evidence → identical commit.
- Mirrors color memory exactly: a cell "remembers" that its placement is settled the
  same way it remembers its color.

### Unit 2 — `src/lib/photonic-retina/retina-shadow-field.js` (light channel)

Pure module, same shape as the assembler. The "light" half of the photonic retina.

- Input: two shadow-field snapshots (`prev`, `curr`), each a per-cell scalar/role map
  sourced from `shadow-amp.js` output. Passed in **by interface** — this module does
  NOT import codex, preserving the Cell Wall and Retina purity.
- Output: `shadowDelta` — the set of cell indices whose lighting changed, regardless
  of whether the cell's own value changed. This is the non-local signal that no
  per-cell value delta can produce.

### Unit 3 — `src/lib/photonic-retina/retina-perception.js` (assembler)

Pure join. Depends only on interfaces (a delta object, a bitmask, a shadowDelta) — not
on phosphorylation or lattice internals, so it is testable with hand-built inputs.

Composes the three channels into one attend mask:

```
attendMask =  (placementChanged AND NOT committed)   // new geometry to settle
           OR  shadowDelta                            // committed cells the light moved on
```

Emits a `PerceptionFrame` (see contract below).

### Reused unchanged

`encodeToPhotonicRetina`, `createLowBitPreview`, and the existing `phosphorylation`
color commit. No edits to Retina core. **`createPacketDelta` is NOT used for per-cell
attribution** (see Cell Indexing Invariant) — the packet serves only as a whole-frame
fingerprint / fast early-out.

## Cell Indexing Invariant (resolves the packet-dimension risk)

**Hard invariant: every PerceptionFrame mask indexes lattice cells in canonical
row-major order — never Retina packet vector slots.**

The Retina packet vector is unsuitable as the per-cell index source, verified in the
encoder/normalizer:

1. `packet.dimension === config.targetDimension` (default 256), i.e. the *compressed
   vector size*, not the cell count. (`retina-normalize.js` final loop fills a fixed
   `Float32Array(targetDimension)`.)
2. The normalizers emit ~5 interleaved fields per cell (coordinates: `x,y,z,emphasis,
   color`; lattice: `col,row,emphasis,color,occupied`), so vector slot ≠ cell even
   before compression.
3. The fill is `values[i % values.length]` — wrap-tiles on underflow, silently drops
   trailing cells on overflow. Slot index carries no stable cell identity.

Consequence: setting `targetDimension = cellCount` alone does **not** yield a 1:1 cell
map with the current normalizers. We therefore adopt **Option A's principle (perception
indexes cells, uncompressed) via Option C's mechanism**:

- **Per-cell masks** (`changedMask`, `committedMask`, `shadowMask`, `attendMask`) are
  built from **pre-compression lattice cell deltas** in canonical row-major order —
  comparing the prior and current lattice cell arrays directly, cell-indexed.
- **The Retina packet is retained only as a frame fingerprint**: `frameHash` / a cheap
  "did anything change at all this tick" early-out, and for the existing
  caching/dedup/diagnostics paths. It never indexes a mask.
- A single shared `cellIndex(row, col, dimension)` helper defines the canonical order;
  all masks derive their indexing from it. Test #2 locks it.

**Future compression (deferred):** once stable, a compressed attention map can be added
by storing a `cellIndexMap` beside the packet (Option B), translating compressed slots
back to cell indices. Not in Phase 1.

## Data Flow (per tick)

1. Pipeline produces/mutates lattice coordinates.
2. `encodeToPhotonicRetina(coords)` → current `packet` (fingerprint only; its
   `frameHash` gives a cheap "did anything change at all" early-out).
3. Cell-indexed diff of (prevCells, currCells) in canonical row-major order →
   `changedMask` (per-cell own-value delta). **Not** from `createPacketDelta`.
4. `qbit-placement-memory` evaluates evidence → `committed` bitmask.
5. `shadow-amp` produces current shadow field; `retina-shadow-field`
   diffs (prevShadow, currShadow) → `shadowDelta`.
6. `retina-perception` composes → `PerceptionFrame { attendMask, ... }`.
7. Pipeline processes only `attendMask` cells; commits new placements (updates the
   memory field) for next tick. `packet` and shadow field become `prev` for next tick.

## Agent-Facing Contract: `PerceptionFrame`

Numeric, deterministic, typed-array based (consumer is procedural/ML, not LLM):

```
PerceptionFrame {
  cellCount:    int,        // number of lattice cells; ALL masks are length cellCount
  cols:         int,        // lattice width  — canonical row-major: index = row*cols+col
  rows:         int,        // lattice height
  attendMask:   Uint8Array, // 1 = pipeline must process this cell, 0 = ignore
  attendIndices:Uint32Array,// dense list of attend cell indices (convenience)
  committedMask:Uint8Array, // 1 = placement settled
  shadowMask:   Uint8Array, // 1 = lighting changed this tick
  changedMask:  Uint8Array, // 1 = own-value delta this tick (from packet delta)
  generation:   int,        // monotonic tick counter (caller-supplied, not wall-clock)
  frameHash:    string,    // content fingerprint over all masks (excludes generation); equal content across ticks => equal hash
}
```

Indexing for every mask is canonical **row-major lattice cell order**
(`index = row*cols + col`), NOT Retina packet vector order. This alignment is the
single most important invariant (see Cell Indexing Invariant / Risks).

## Error Handling

- **Fail safe = attend, not skip.** If placement evidence or a shadow snapshot is
  missing/malformed for a cell, that cell defaults to `attend = 1`. Better to re-look
  than to silently leave the canvas wrong. (Skipping is only ever earned by a positive
  commit.)
- Retina shadow-mode behavior is preserved: encoding failures in shadow mode return
  null and the pipeline falls back to a full-attend frame (every cell = 1), i.e. the
  current re-scan-everything behavior. The feature degrades to today's behavior, never
  worse.
- First tick (no `prev`) → full-attend frame by definition.

## Determinism

- All three new units obey the Retina determinism contract: no `Date.now`, no
  `Math.random`, stable object-key ordering, stable serialization for `frameHash`.
- `generation` counters are integers supplied by the caller, never wall-clock.
- Identical (coords, evidence, shadow field, prev state) → identical `PerceptionFrame`
  including `frameHash`.

## Testing

New `tests/photonic-retina/` and `tests/pixelbrain/` coverage:

1. **placement-memory determinism** — same evidence → same `{committed, confidence}`;
   threshold boundary behaves like `COLLAPSE_THRESHOLD`.
2. **mask alignment** — `attendMask`/`committedMask` indexing matches the shared
   `cellIndex(row, col, cols)` row-major order for several lattice sizes, and a known
   single-cell edit lights exactly its own index (guards the core invariant). Includes
   a negative test that the packet vector slot is NOT used as a cell index.
3. **assembler composition** — `attendMask = (changed AND NOT committed) OR shadowDelta`
   verified against hand-built channels, including the key case: a committed,
   unchanged cell with a shadowDelta hit → `attend = 1`.
4. **non-local shadow regression** — placing an occluder re-wakes a previously
   committed neighbor purely via the shadow channel.
5. **the core win** — a fully committed canvas with no value changes and no shadow
   change → empty `attendIndices` (pipeline does nothing). This is the regression that
   proves we stopped re-scanning.
6. **fail-safe** — malformed evidence / missing snapshot → that cell attends.
7. **degrade-to-today** — Retina null in shadow mode → full-attend frame.

## Risks

1. **Mask / packet index drift (highest).** The Retina packet vector is compressed
   (`targetDimension`), interleaved (~5 fields/cell), and wrap/truncate-filled — its
   slot index is NOT a cell index. Using it to index masks would silently attend/ignore
   the wrong cells. Mitigation: masks are built from pre-compression lattice cells via a
   single shared `cellIndex` helper, never from the packet (see Cell Indexing
   Invariant); test #2 locks the ordering. (Compare prior canvas/ctx kerning-drift bug.)
2. **Shadow-field snapshot cost.** Diffing full shadow fields each tick could rival the
   re-scan we're removing. Mitigation: shadow-amp already runs in the pipeline; reuse its
   output rather than recompute, and the shadowDelta is itself incremental.
3. **Cell Wall violation.** `retina-shadow-field.js` must not import codex. Mitigation:
   shadow field is passed in by interface; assembler depends only on plain objects.
4. **Over-committing placement.** A too-loose commit threshold would skip cells that
   still need work. Mitigation: fail-safe defaults to attend; threshold tunable like
   `phosphorylationThreshold`, validated by test #5 / #4 balance.

## Wiring note

The two existing Retina↔PixelBrain entry points (`buildPixelBrainPhotonicRoute`,
`routeQbitFieldToPhotonicBridge`) are currently coded and test-covered but **not
called by any live runtime path** — only tests exercise them. This design adds the
perception layer; activating it in the live procedural loop (the actual call site that
drives data through the eye) is a follow-up wiring step, tracked in the implementation
plan, not assumed done here.
