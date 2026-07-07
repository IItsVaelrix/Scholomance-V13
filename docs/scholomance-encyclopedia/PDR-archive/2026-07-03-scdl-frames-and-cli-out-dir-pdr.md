# PDR — SCDL v1.1: First-Class Frames + CLI Output Directory

**Status:** Approved — review clarifications applied (frame density law, export naming law, painter-slot wording)
**Date:** 2026-07-03
**Author:** Claude (authoring-experience findings from the `void_acolyte` build)
**Archive:** `docs/scholomance-encyclopedia/PDR-archive/2026-07-03-scdl-frames-and-cli-out-dir-pdr.md`
**Depends on:** [`scdl-v1-pdr.md`](scdl-v1-pdr.md), [`SCDL_COMPILER_WHITE_PAPER.md`](../Scholomance%20White%20Papers/SCDL_COMPILER_WHITE_PAPER.md), [`2026-06-15-pixelbrain-animation-encoding-white-paper.md`](2026-06-15-pixelbrain-animation-encoding-white-paper.md)

---

## 1. Problem Statement

Two friction points surfaced while authoring the first SCDL character asset
(`void_acolyte`, 32x48, 12 parts) and its 4-frame idle loop:

**A. Animation requires whole-file duplication.**
SCDL has no frame concept. The idle loop required four files —
`void_acolyte.scdl` plus `void_acolyte_idle_f1/f2/f3.scdl` — each a full
~99-line copy of the base, to change 5–11 lines per frame. The loop manifest
(`void_acolyte/void_acolyte.idle.json`, ad-hoc contract `SCDL-FRAME-LOOP-v0`)
had to be hand-written, and packet IDs hand-copied into it after each compile.
Every polish pass on the base sprite now requires re-applying the same edit to
three sibling files — the exact drift hazard SCDL exists to eliminate.

**B. CLI exports land in the CWD with inconsistent names.**
`scdl.cli.js compile` writes exports to the process working directory, not
next to the source file. Worse, naming differs by export count:

```
--export json,svg,phaser,png  →  void_acolyte-json.json, void_acolyte-png.png, ...
--export png                  →  void_acolyte.png          (suffix dropped)
```

Every compile in the `void_acolyte` session was followed by a manual `mv`,
and one `mv` failed outright because the single-target name was unpredictable.

---

## 2. Scope

| In scope | Out of scope (deferred) |
|----------|------------------------|
| `frame` blocks in SCDL grammar (override/add/omit parts per frame) | Tweening / interpolation between frames |
| One `PixelBrainAssetPacket` per frame | Runtime animation players |
| Compiler-emitted `SCDL-FRAME-LOOP-v1` manifest | `reference`/`instance` cross-asset composition |
| `aseprite` export target via `aseprite-binary-codec.js` | Real boolean lowering (`lower-booleans.js`) |
| CLI `--out-dir` + deterministic export naming | `preview` CLI command (upscale/GIF) |
| | Packed spritesheets (Animation Frame Law forbids) |

**Scope guard:** the deferred column stays deferred. This PDR lands as a
tight compiler/exporter upgrade; anything animation-runtime-shaped is a
separate PDR.

---

## 3. Design Decisions

| Decision | Rationale |
|----------|-----------|
| Frames are **part-level deltas**, not asset copies | The deltas *are* what an animator authors ("hood circles y+1"); matches the paint-don't-algorithm doctrine |
| **Frame 0 is the base asset itself** | A file with frame blocks compiles frame 0 byte-identical to the same file without them — base packet ID never moves |
| **One packet per frame** | Animation Frame Law: N poses = N frames. Geometry identity per white paper §5.6 applies per frame |
| Frame overrides **replace whole parts** (or add/omit), never patch pixels | Part is already the atomic authoring unit; pixel patches would create a second, weaker delta vocabulary |
| Added parts take an explicit **`after <partId>` anchor** | Painter's order is meaning: `hoodbrow` must sit after `face` but before `eyes`. Appending at end would paint over the eyes |
| Manifest is **compiler output**, never hand-written | Packet IDs and checksums are compile artifacts; hand-copying them is how manifests rot |
| `aseprite` target lowers via existing `aseprite-binary-codec.js` | Reuse per SymmetryAMP precedent; each frame gets its **own deep-copied layers** per the codec Encoder Law |
| `--out-dir` defaults to **the source file's directory**, not CWD | Compiles become location-independent; fixture dirs stay self-contained |
| Export names are **always `<asset>-<target>.<ext>`** | Kills the single-vs-multi naming fork; scripts can predict output paths |

---

## 4. Grammar — SCDL v1.1 Additions

```ebnf
program      ::= asset_decl palette_block? part_block* loop_decl? frame_block* export_decl?

loop_decl    ::= 'loop' NAME ['duration' INTEGER]
                 (* loop name + default per-frame duration in ms; default 400 *)

frame_block  ::= 'frame' INTEGER [STRING] ['duration' INTEGER] '{' frame_item* '}'
                 (* INTEGER >= 1; frame 0 is implicitly the base asset.
                    Indices obey the Frame Index Law (§4.1).
                    STRING is an optional beat label, e.g. "hood-dip" *)

frame_item   ::= frame_part
               | omit_stmt

frame_part   ::= 'part' IDENT ['after' IDENT] ['material' IDENT] '{' part_op* '}'
                 (* if IDENT matches a base part: full replacement, keeps the
                    base part's painter-order slot — never spatial metadata.
                    An 'after' anchor on a replacement is an error, SCDL-014.
                    If IDENT is new: added at the 'after' anchor; 'after' is
                    then mandatory (SCDL-014 if missing or unknown). *)

omit_stmt    ::= 'omit' IDENT
                 (* removes a base part from this frame; unknown id → SCDL-012 *)
```

### 4.1 Frame Index Law

Frame indices are **dense and declaration-ordered**: `1, 2, 3, ... N`, in
that textual order. Sparse or out-of-order declarations are **rejected**
(SCDL-013) — never normalized or sorted — so the source reads in exactly the
order the loop plays, and `framePackets`, manifest order, and `-f<N>-`
filenames are always a dense, predictable sequence.

```
Valid:
frame 1 { ... }
frame 2 { ... }
frame 3 { ... }

Invalid (all emit SCDL-013):
frame 2 { ... }        # missing frame 1
frame 1 { ... }
frame 3 { ... }        # missing frame 2
frame 2 { ... }        # out of declaration order
```

### 4.2 Replacement Ordering Law

A frame replacement keeps the replaced base part's **painter-order slot** —
the position in the part paint sequence, not any spatial property. There is
no spatial metadata to preserve; parts have no origin. A replacement does not
require and does not accept an `after` anchor; supplying one emits SCDL-014.

### Example — the `void_acolyte` idle loop as one file

```
asset void_acolyte canvas 32x48

palette { ... }

part staff material bark { ... }
part hood material void_cloth {
  circle 15.5 10 radius 7.5 hoodhi
  circle 15.5 10.5 radius 6 hooddeep
}
part face material skin_light { ... }
part eyes material cyan_glow { ... }
# ... remaining base parts ...

loop idle duration 400

frame 1 "hood-dip" {
  part hood material void_cloth {
    circle 15.5 11 radius 7.5 hoodhi
    circle 15.5 11.5 radius 6 hooddeep
  }
  part hoodbrow after face material void_cloth {
    rect 12 7 8 2 hood
  }
}

frame 2 "glow-surge" {
  part hood material void_cloth { ... }          # stays low
  part hoodbrow after face material void_cloth { ... }
  part eyes material cyan_glow {
    symmetry x
    cell 13 11 eye
    cell 13 10 eyebright
    glow radius 2
  }
}

frame 3 "gold-glint" {
  part staff material bark {
    line 25 13 25 46 wood
    line 26 13 26 46 wooddark
    cell 25 26 glint
    cell 25 27 glint
  }
}

export json png aseprite
```

Four files and a hand-written manifest collapse into one source of truth;
polishing the base automatically propagates to every frame that doesn't
override the touched part.

---

## 5. AST Contract — `SCDL-AST-v1` → version `1.1.0`

`parts`, `palette`, `canvas`, `exports` are unchanged. New optional
top-level fields (absent = single-frame asset, fully backward compatible):

```jsonc
{
  "contract": "SCDL-AST-v1",
  "version": "1.1.0",
  // ... existing fields ...
  "loop": { "name": "idle", "defaultDurationMs": 400 },
  "frames": [
    {
      "index": 1,
      "label": "hood-dip",
      "durationMs": 400,
      "overrides": [
        { "mode": "replace", "part": { "id": "hood", "material": "void_cloth", "ops": [ /* ... */ ] } },
        { "mode": "add", "after": "face", "part": { "id": "hoodbrow", /* ... */ } }
        // { "mode": "omit", "partId": "..." }
      ]
    }
  ]
}
```

---

## 6. Compiler Pipeline Changes

One new pass, `expandFramesPass`, runs immediately after `validatePass`
(before SemQuant, so semantic annotation sees each frame's final part list):

```
validatePass
     │
     ▼
expandFramesPass          ← NEW: materializes N virtual single-frame ASTs
     │                      (frame 0 = base parts untouched)
     ▼ (per frame)
semanticUnifierPass → resolveColors → resolveMaterials → expandVector
   → expandSymmetry → expandCells → emitPacket
     │
     ▼
emitDiagnosticsPass       (aggregates all frames' diagnostics)
```

`CompileResult` gains fields; existing fields keep their v1 meaning:

```js
{
  ok, ast, errors, diagnostics,      // unchanged
  packet,                            // unchanged: frame 0 packet (base identity)
  framePackets,                      // [packet0, packet1, ...] — packet0 === packet
  frameLoop,                         // SCDL-FRAME-LOOP-v1 manifest (null if no frames)
}
```

Determinism law: `expandFramesPass` is a pure function; virtual ASTs are
new objects; the base AST is never mutated. Frame packets hash independently
per white paper §5.6 (semantic metadata stays additive).

### New Error Codes

| Sub-code | Label | Severity | Category | Description |
|:---|:---|:---|:---|:---|
| `0x100C` | `SCDL-012` | ERROR | `STATE` | Frame targets unknown part id (replace or omit) |
| `0x100D` | `SCDL-013` | ERROR | `VALUE` | Frame Index Law violation: duplicate, sparse, or out-of-declaration-order index, or index 0 declared explicitly |
| `0x100E` | `SCDL-014` | ERROR | `STATE` | Added part missing/unknown `after` anchor, or `after` given on a replacement (Replacement Ordering Law) |
| `0x100F` | `SCDL-015` | WARN | `STATE` | Frame declared but identical to base after expansion (dead frame) |

---

## 7. `SCDL-FRAME-LOOP-v1` Manifest Contract

Supersedes the hand-written v0 shape currently at
`codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.idle.json`.
Emitted by the compiler as part of `CompileResult` and written by the CLI as
`<asset>-frameloop.json`:

```jsonc
{
  "contract": "SCDL-FRAME-LOOP-v1",
  "asset": "void_acolyte",
  "loop": "idle",
  "canvas": { "width": 32, "height": 48 },
  "defaultDurationMs": 400,
  "sourceChecksum": "000000005f3a91c2",   // same hashString digest as the AST
  "frames": [
    { "index": 0, "label": "rest",      "durationMs": 400, "packet": "pbasset_2595caa6" },
    { "index": 1, "label": "hood-dip",  "durationMs": 400, "packet": "pbasset_f8f62d21" },
    { "index": 2, "label": "glow-surge","durationMs": 400, "packet": "pbasset_b5578155" },
    { "index": 3, "label": "gold-glint","durationMs": 400, "packet": "pbasset_5aa3e32f" }
  ]
}
```

Canonical state is the frame packets. Raster previews (PNG strips, GIFs)
are never a source of truth — consistent with the SCDNA no-raster-drift rule.

---

## 8. Exporters

### Export Naming Law

**All** targets use target-suffixed names, always: `<asset>-<target>.<ext>`.
The **only** thing single-frame assets omit is the `-f<N>-` infix. There is
no case where the old bare `<asset>.<ext>` single-target name survives —
implementers must not preserve it.

```
Single-frame:
<asset>-json.json
<asset>-png.png
<asset>-svg.svg
<asset>-phaser.json

Multi-frame:
<asset>-f0-json.json
<asset>-f1-json.json
<asset>-f0-png.png
<asset>-f1-png.png
<asset>-frameloop.json
```

### New target: `aseprite`

Lowers `framePackets` into the `aseprite-binary-codec.js` payload:

- `width`/`height` from canvas (one frame, per the Animation Frame Law —
  never a packed spritesheet).
- One payload frame per packet, `duration` from the manifest.
- Parts become layers (`part.id` → layer name), preserving part order.
- **Each frame carries its own deep-copied `layers`** per the codec Encoder
  Law — never a shared array.
- Round-trip verification must check frame count + dimensions only; the
  decoder's known cell-accumulation bug makes per-frame cell assertions
  unreliable (white paper §Decoder Warning).

---

## 9. CLI Changes

```bash
node scdl.cli.js compile <file> [--export json,png,...] [--out-dir <dir>]
```

| Behavior | v1 (current) | v1.1 |
|----------|--------------|------|
| Output location | process CWD | `--out-dir`, default: **source file's directory** |
| Multi-target name | `<asset>-<target>.<ext>` | unchanged |
| Single-target name | `<asset>.<ext>` (inconsistent) | `<asset>-<target>.<ext>` (always — Export Naming Law, §8) |
| Frame outputs | n/a | `<asset>-f<N>-<target>.<ext>` + `<asset>-frameloop.json` |

Breaking change is limited to output paths/names, not content. Existing
fixture outputs get regenerated once in the migration commit; goldens that
key on file *content* (packet JSON, SVG bytes) are untouched by design
(§5.6 identity policy).

---

## 10. SCD64 Laws Compliance

| Law | Compliance |
|-----|------------|
| Deterministic output | `expandFramesPass` is pure; frame order is declaration order; packet IDs stable per frame |
| Slot/block thinking | `loop` and `frame` are first-class blocks alongside `asset`/`palette`/`part` |
| Checksummed meaning | Manifest carries the source `hashString` checksum; frame packets hash independently |
| Hover-decodable diagnostics | SCDL-012..015 encode as `PB-ERR-v1` with line/col of the frame block |
| No silent mutation | Base AST untouched; overrides materialize new virtual ASTs |
| Machine-readable failure | `compileSCDL()` still never throws; frame errors land in the shared `errors` array with `frameIndex` context |

---

## 11. Test Plan

Location per white paper §9.2: `tests/codex/core/pixelbrain/scdl/`.

`scdl.frames.test.js`:
1. **Base identity invariant** — adding frame blocks leaves frame-0 packet ID byte-identical to the frameless compile.
2. Replace / add-with-anchor / omit each produce the expected coordinate deltas (assert against `void_acolyte` idle fixtures ported to one file).
3. `after` anchor ordering: added `hoodbrow` paints above `face` and below later `eyes`, matching the stated intent.
4. **Painter slot replacement**: replacing `face` keeps its original slot between neighboring parts — cells still paint over `hood`, under `eyes`.
5. **Sparse frame rejection**: `frame 2` without `frame 1` emits SCDL-013.
6. **Out-of-order frame rejection**: `frame 2` then `frame 1` emits SCDL-013 (no sorting/normalization).
7. SCDL-012/013/014/015 fire with correct line/col and frame context; `after` on a replacement emits SCDL-014.
8. Duration defaulting: `loop ... duration` → frames without `duration`.
9. Manifest golden: `SCDL-FRAME-LOOP-v1` shape + checksum stability across two compiles; **the generated manifest replaces the hand-written v0 manifest** as the only source of truth.

`scdl.aseprite-export.test.js`:
10. Payload has N frames, per-frame `layers` arrays are distinct object graphs (Encoder Law), durations match manifest.

`scdl.cli.test.js`:
11. `--out-dir` honored; default is source dir.
12. **Single-frame naming**: `--export png` writes `<asset>-png.png`, never `<asset>.png`.
13. **No frame infix for single-frame multi-target**: `--export json,png` writes `<asset>-json.json` and `<asset>-png.png` (no `-f0-`).

---

## 12. Migration

1. Collapse `void_acolyte_idle_f1/f2/f3.scdl` into `void_acolyte.scdl` frame
   blocks; delete the three sibling files.
2. Replace hand-written `void_acolyte.idle.json` (v0) with compiler-emitted
   `void_acolyte-frameloop.json` (v1); keep the GIF preview as a non-canonical
   artifact.
3. Regenerate fixture export files once under the new naming.
4. Update `SCDL_COMPILER_WHITE_PAPER.md` §3 (grammar), §5 (pipeline), §6
   (error catalogue), §8 (CLI) — plus a new §7.4 for the `aseprite` target.

---

## 13. Ownership & Handoff

Per the agent coordination table: **Codex** approves the contract deltas
(`SCDL-AST-v1` → 1.1.0, new `SCDL-FRAME-LOOP-v1`, CompileResult additions);
**Gemini** implements the pass, exporter, CLI flags, and tests. Evidence
fixtures from the motivating build live at
`codex/core/pixelbrain/scdl/fixtures/void_acolyte*` (four-file idle loop,
hand-written v0 manifest) and are the before-state this PDR deletes.
