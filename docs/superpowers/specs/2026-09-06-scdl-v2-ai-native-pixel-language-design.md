# SCDL v2 — AI-Native Mathematical Pixel-Art Language

**Date:** 2026-09-06
**Status:** Approved architecture; implementation not started
**Classification:** Architectural language and compiler redesign
**Applies to:** SCDL, PixelBrain asset compilation, animation authoring, canonical
bytecode, exporters, and the complete PixelBrain AMP/effect catalog
**Legacy boundary:** Every valid SCDL v1/v1.2 source remains on its frozen compiler
path with byte-identical output
**Search anchor:** `SCHOL-ENC-BYKE-SEARCH-SCDL-V2-AI-NATIVE-PIXEL-LANGUAGE`

## 1. Intent

SCDL v2 is a compile-time programming language for painting pixel art through
mathematics. It must let an AI agent express exact geometry, reusable
constructions, sequences such as Fibonacci, procedural variation, masks,
compositing, and animation with JavaScript-like generative power while remaining
more regular, auditable, and deterministic than a general-purpose scripting
language.

The governing model is:

> Mathematics produces spatial relations. Those relations lower into canonical
> typed instructions. Those instructions determine every pixel and animation
> sample.

AI agents author textual SCDL, invoke the compiler, read structured diagnostics,
repair their source explicitly, and recompile. The compiler never silently repairs
or rewrites invalid source.

## 2. Current State and Motivation

SCDL v1/v1.2 already provides deterministic assets, palette references, parts,
vector primitives, cells, symmetry, frames, a scene graph, exporters, SemQuant
metadata, and PB-ERR diagnostics. Its existing focused suite passes 321 tests as
of this design.

The current architecture nevertheless has structural limits that cannot be fixed
safely by adding more cases to the existing recursive-descent parser:

- Grammar order is rigid and heavily contextual.
- Several operands are positional, and some missing operands become fallback
  values before later validation.
- Flat-mode `rotate`, `scale`, and `translate` are accepted but do not lower.
- `instance` has distinct part-op and scene-node meanings.
- Flat, scene-graph, and frame authoring do not share one composition model.
- There is no typed expression, unit, function, collection, or lexical-scope
  system.
- Boolean operations target visible sibling parts instead of first-class shape
  values.
- The AMP ecosystem spans multiple incompatible function signatures and pipeline
  phases; production wiring is not the same as SCDL reachability.

SCDL v2 therefore uses a separate parser and typed compiler path selected by an
explicit version header. It does not reinterpret legacy files.

## 3. Goals

1. Make textual SCDL exceptionally predictable for AI generation and repair.
2. Express non-trivial mathematical asset programs without unrestricted runtime
   scripting.
3. Preserve exact, versioned rasterization behavior across platforms.
4. Make shapes, masks, paths, palettes, layers, transforms, and timelines
   first-class immutable values.
5. Guarantee compilation terminates within declared resource bounds.
6. Preserve authored mathematical intent in canonical bytecode.
7. Compile animation into a finite asset package; never execute SCDL source in the
   game runtime.
8. Provide a truthful typed route from SCDL to every AMP in the generated effect
   catalog.
9. Preserve all valid v1/v1.2 outputs and identities byte-for-byte.
10. Make diagnostics complete enough for an agent to repair source without
    guessing.

## 4. Non-Goals

- SCDL is not a browser or server scripting language.
- SCDL has no network, filesystem, process, clock, environment, or asynchronous
  APIs.
- SCDL does not permit dynamic evaluation, reflection, prototype mutation, or
  unrestricted jumps.
- SCDL does not silently coerce types or units.
- SCDL does not use ambient or unseeded randomness.
- SCDL source does not execute at asset playback time.
- The v2 compiler does not change legacy grammar or packet identity.
- Production import-graph reachability alone does not count as SCDL AMP
  compatibility.

## 5. Architectural Decision

Three approaches were considered:

1. Extend the existing v1 parser. Rejected because new control flow and types would
   amplify existing contextual and recovery weaknesses.
2. Build a typed SCDL v2 instruction compiler beside the frozen legacy path.
   Selected because it supports strong semantics, canonical bytecode, structured
   diagnostics, and exact compatibility isolation.
3. Embed a sandboxed JavaScript subset. Rejected because JavaScript semantics are
   difficult to canonicalize, statically bound, and make durable as PixelBrain
   bytecode.

The version router is explicit:

```text
first significant declaration is `SCDL 2` -> v2 compiler
otherwise                                  -> frozen v1/v1.2 compiler
```

No heuristic version detection is allowed.

## 6. Compiler Pipeline

```text
Textual SCDL v2
  -> lossless tokenizer
  -> recoverable concrete syntax tree (CST)
  -> parsed AST
  -> name and lexical-scope resolution
  -> type and unit checking
  -> termination and resource-bound verification
  -> resolved program IR
  -> canonical SCDL-BC-v2 bytecode
  -> bounded bytecode evaluation
  -> immutable Shape / Mask / Layer / Timeline IR
  -> AMP compile passes and validated AMP descriptors
  -> deterministic rasterization and animation sampling
  -> PixelBrain packets, manifests, and exports
```

Every public stage returns a result object containing diagnostics. No exception may
cross the public compiler boundary. A failed stage may provide a recoverable CST,
symbol table, or partial analysis for tooling, but it may not emit bytecode, a
packet, or a partial export.

Canonical bytecode is produced before evaluation so it preserves formulas and
construction intent rather than only evaluated pixels.

## 7. Source Form

SCDL v2 uses uppercase opcode-first statements and parenthesized prefix
expressions. The form is deliberately regular and close to an AST:

```scdl
SCDL 2
ASSET fibonacci_bloom
CANVAS WIDTH 64 HEIGHT 64

CONST $count I32 12
CONST $center VEC2 (VEC2 (PX 32) (PX 32))
CONST $turn ANGLE (DEGREES 137.5)

SEQUENCE $fib TYPE I32 COUNT $count {
  SEED 0
  SEED 1
  NEXT (ADD (PREV 1) (PREV 2))
}
```

### 7.1 Syntax laws

- One statement begins with one unambiguous opcode.
- Required operands are named unless an opcode has one permanent universal
  signature.
- `$name` always denotes an immutable value binding.
- Bare words are opcodes, types, enum members, or declared resource identifiers.
- Braces establish lexical scope.
- Symbols must be declared before use, except that a function may refer to itself
  within its verified recursion contract.
- Mutual recursion is not part of the v2 core.
- There is no truthiness and no implicit type conversion.
- Prefix expressions have no precedence ambiguity.
- Comments and whitespace are non-semantic.
- Canonical formatting has exactly one spelling, case, numeric form, operand
  order, and indentation policy.
- Optional syntax sugar may be introduced only when the formatter can lower it to
  canonical source without changing bytecode. It is not required for the first
  release.

### 7.2 Parser recovery

The parser synchronizes at statement and block boundaries. It reports multiple
independent errors when safe, but never invents missing semantic values. Unknown
opcodes, omitted required operands, invalid literals, and malformed blocks fail
closed.

## 8. Type and Unit System

The initial closed type set is:

```text
BOOL
I32
U32
FIXED
RATIO
PX
ANGLE
DURATION
COLOR
VEC2
RECT
RANGE
SEQUENCE<T>
PALETTE
PATH
SHAPE
MASK
TRANSFORM
MATERIAL
LAYER
TIMELINE
```

`PX`, `ANGLE`, and `DURATION` are distinct units. Mixing units is an error unless
an explicit conversion instruction is present.

Integer lattice coordinates remain authoritative. Fractional computation uses
exact rationals or a compiler-defined fixed-point representation. Potentially
approximate operations such as trigonometry and square roots use versioned,
deterministic algorithms and precision. Conversion to lattice coordinates requires
an explicit rounding policy:

```text
FLOOR
CEIL
NEAREST_EVEN
AWAY_FROM_ZERO
```

Declared opcode defaults are legal only when present in the opcode registry.
Lowering materializes every default into canonical bytecode; bytecode never relies
on an implicit runtime default.

## 9. Mathematical Core

The initial mathematical vocabulary includes:

```text
ADD SUB MUL DIV MOD POW
ABS MIN MAX CLAMP
FLOOR CEIL ROUND
SQRT SIN COS TAN ATAN2
LERP MAP_RANGE
SUM PRODUCT FOLD
GCD LCM
VEC2 DISTANCE DOT CROSS NORMALIZE
```

Functions are pure and may return any mathematical or asset-domain value:

```scdl
FN fibonacci PARAM $n I32 RETURNS I32 RECURSION_MAX 64 {
  IF (LTE $n 1) {
    RETURN $n
  }
  RETURN (ADD
    (CALL fibonacci (SUB $n 1))
    (CALL fibonacci (SUB $n 2)))
}
```

### 9.1 Control and collection instructions

```text
IF / ELSE
MATCH
FOR ... IN finite-range
FOR ... IN finite-collection
SEQUENCE
MAP
FILTER
ZIP
FOLD
CALL
RETURN
EMIT
```

`CONST` and `LET` create immutable bindings. State across iterations is represented
by `SEQUENCE`, `FOLD`, or a bounded recurrence rather than mutable variables.

### 9.2 Termination law

The verifier accepts finite ranges and collections, counted sequences,
structurally decreasing recursion, explicitly depth-capped recursion, bounded
fractals and L-systems, and deterministically sampled curves. It rejects
unrestricted loops, non-decreasing uncapped recursion, arbitrary jumps, and dynamic
code evaluation.

## 10. Deterministic Variation

Random and noise operations require explicit algorithms and seeds:

```scdl
RNG $scatter ALGORITHM PCG32 SEED 481516
LET $offset VEC2 (RANDOM_VEC2 $scatter MIN (PX -2) MAX (PX 2))
```

The seed, algorithm version, sampling coordinates, octaves, ranges, and other
parameters are recorded in bytecode. There is no global random source.

## 11. Construction and Painting Model

Functions and blocks construct immutable values. They do not directly mutate a
canvas. `PAINT` is the explicit commit from symbolic construction to painter order:

```scdl
FN petal PARAM $radius PX PARAM $color COLOR RETURNS SHAPE {
  RETURN (ELLIPSE
    CENTER (VEC2 (PX 0) (PX -6))
    RADIUS_X $radius
    RADIUS_Y (MUL $radius 2))
}

SHAPE $flower {
  RADIAL COUNT 8 {
    EMIT (CALL petal (PX 3) rose)
  }
}

LAYER petals ORDER 20 {
  PAINT $flower
    AT (VEC2 (PX 32) (PX 32))
    FILL rose
    RASTER CENTER
}
```

Painter order is explicit at both layer and statement level. A constructed shape is
not visible until painted.

## 12. Geometry

First-class geometry includes:

- Pixel, line, polyline, ray, rectangle, and rounded rectangle
- Circle, ring, ellipse, arc, and sector
- Triangle, regular polygon, arbitrary polygon, and star
- Bezier and SVG-compatible paths
- Parametric curves and plots
- Grids, tilings, logarithmic spirals, Fibonacci spirals, and radial arrangements
- Text or glyph contours backed by an explicit deterministic glyph resource
- Imported raster or vector contours backed by a declared content-addressed
  resource

Geometry operations return new values:

```scdl
SHAPE $cutout (SUBTRACT $plate $rune)
SHAPE $overlap (INTERSECT $a $b)
SHAPE $combined (UNION $a $b)
SHAPE $edge (OUTLINE $combined WIDTH (PX 1))
MASK $inside (TO_MASK $combined)
```

Operand shapes do not become visible merely because another shape references them.
This replaces the v1 sibling-part boolean workaround for v2 programs.

### 12.1 Rasterization law

Every primitive has a canonical algorithm version, boundary-inclusion rule,
winding rule, symmetry guarantee, degeneracy rule, and cost model. Authors choose
an explicit policy where more than one pixel-art interpretation is valid:

```text
CENTER       pixel center lies inside the ideal shape
SUPERCOVER   every touched lattice cell is included
MIDPOINT     lattice-native symmetric circle or ellipse
BRESENHAM    canonical integer line
THRESHOLD    deterministic fixed-point coverage threshold
```

There is no hidden anti-aliasing or renderer-dependent sampling. Transform
composition has one fixed order. Conversion from mathematical space to the lattice
uses the declared rounding policy.

### 12.2 Anchors and constraints

Named anchors, bounds, alignment, and assertions prevent coordinate guessing:

```scdl
ANCHOR $tip ON $blade AT MAX_Y
ALIGN $gem.CENTER TO $blade.$tip
ASSERT (INSIDE $gem (BOUNDS CANVAS))
```

Failed assertions are compile errors with both the assertion span and the derived
values that falsified it.

## 13. Layers, Masks, and Compositing

Every paint instruction declares a target layer, shape or mask, transform, fill or
stroke, rasterization policy, composite mode, and optional material and semantic
role. The first release supports deterministic pixel-art composite modes with
versioned integer or fixed-point channel math. Unsupported renderer blend behavior
may not be inherited implicitly.

Masks are immutable values and can be combined independently of visible layers.
Layer visibility, painter order, opacity, palette binding, and material binding are
typed properties rather than ad hoc metadata.

## 14. Mathematical Animation

Animation is authored as time-dependent mathematics and compiled to finite sample
data. SCDL source never runs in the game runtime.

```scdl
TIMELINE idle
  DURATION (MS 800)
  SAMPLE_RATE (FPS 12)
  LOOP REPEAT
{
  TRACK TARGET orb PROPERTY TRANSFORM_Y {
    FORMULA (MUL (PX 2) (SIN (MUL TAU $time_normalized)))
  }

  TRACK TARGET glow PROPERTY OPACITY {
    KEYFRAME AT (MS 0) VALUE (RATIO 1 4) EASE LINEAR
    KEYFRAME AT (MS 400) VALUE (RATIO 1 1) EASE SINE_IN_OUT
    KEYFRAME AT (MS 800) VALUE (RATIO 1 4) EASE SINE_IN_OUT
  }
}
```

Animation provides `TIMELINE`, `CLIP`, `TRACK`, `KEYFRAME`, `FORMULA`, `POSE`,
`VISIBILITY`, `VARIANT`, and metadata-only `EVENT` instructions. Tracks may target
stable layers, shapes, instances, masks, anchors, palette entries, material
parameters, or effect parameters.

Time is represented as integer ticks and sampled at rational timestamps. Easing
curves have versioned deterministic definitions. The compiler evaluates each
sample in this order:

```text
timeline time
  -> formulas and keyframes
  -> symbolic transforms and geometry
  -> masks and booleans
  -> rasterization
  -> layer compositing
  -> immutable frame packet
```

Pixels are not interpolated unless the source explicitly selects a pixel-level
transition.

Canonical bytecode retains the mathematical timeline and its derived sample table.
Exporters consume the finite result:

- Aseprite: frames, layers, durations, and tags
- PNG: individual frames or spritesheet
- JSON: timeline manifest and packet references
- Phaser: animation configuration and texture frames
- SVG: a selected frame or deterministic frame sequence

## 15. Canonical SCDL-BC-v2 Bytecode

SCDL-BC-v2 is typed, register-based, and single-assignment. This is more explicit
than a stack machine and easier to inspect mechanically:

```text
.module SCDL-BC-v2
.language 2.0
.canvas 64 64
.capability CORE.SEQUENCE@2.0
.capability GEOMETRY.PARAMETRIC@2.0

%0:i32      = CONST.I32 12
%1:px       = CONST.PX 32
%2:vec2     = VEC2 %1 %1
%3:seq<i32> = SEQ.RECURRENCE count=%0 seed=[0,1] step=ADD(PREV(1),PREV(2))
%4:shape    = GEOM.FIBONACCI_SPIRAL sequence=%3 center=%2
%5:layer    = LAYER.NEW id=spiral order=10
              PAINT layer=%5 shape=%4 fill=gold raster=MIDPOINT
              EMIT.ASSET layers=[%5]
```

Bytecode laws:

- Every instruction has a permanent numeric opcode and textual mnemonic.
- Every register has one static type and one definition.
- Operand encoding, constant representation, and register allocation are
  canonical.
- Names, defaults, references, and extensions are fully resolved.
- Control flow is structured and bounded; arbitrary jumps are forbidden.
- Function cost and verified program bounds are recorded.
- A debug map connects instructions to SCDL source spans.
- Comments, source formatting, and debug data do not affect semantic identity.

### 15.1 Identity

The v2 asset identity hashes:

```text
language semantics version
+ canonical capability set
+ canonical instruction stream
+ canonical constant pool
+ deterministic algorithm versions
```

Two sources that lower to identical semantics receive identical program identity,
even when comments, formatting, or local symbol spelling differ.

The compiled package contains the authoritative bytecode, program hash, verified
resource bounds, derived IR, frame packets, optional raster caches, debug map, and
export manifests. Raster data is replaceable derived data; mathematical bytecode is
the durable source of truth.

## 16. Capability and Module System

Non-core features are explicitly versioned:

```scdl
REQUIRES {
  CORE.MATH VERSION 2.0
  GEOMETRY.STANDARD VERSION 2.0
  ANIMATION.TIMELINE VERSION 1.0
  NOISE.DETERMINISTIC VERSION 1.0
}
```

Initial families are:

```text
CORE.MATH
CORE.SEQUENCE
GEOMETRY.STANDARD
GEOMETRY.PATH
GEOMETRY.PARAMETRIC
PAINT.LAYERS
PAINT.MASKS
COLOR.PALETTE
ANIMATION.TIMELINE
NOISE.DETERMINISTIC
MATERIAL.PIXELBRAIN
IMPORT.CONTENT_ADDRESSED
```

Core opcodes are never redefined. Extensions use qualified names, declare their
capability, and receive new semantic versions when behavior changes. Unsupported
capabilities fail before evaluation.

Pure reusable SCDL modules are content-addressed:

```scdl
IMPORT ornamental_spirals
  FROM "asset://stdlib/ornamental_spirals@1.0"
  HASH "scdl256:..."
  AS spirals
```

Imports are supplied by an authorized compiler resolver. The language itself has
no filesystem or network access. The recorded content hash prevents dependency
drift.

The standard library may provide Fibonacci and Lucas sequences, golden-angle and
logarithmic spirals, symmetry groups, tilings, easing functions, palette utilities,
and deterministic noise constructions. Security- and determinism-critical
primitives remain compiler opcodes.

## 17. Universal AMP Compatibility

The generated `codex/core/pixelbrain/EFFECT_CATALOG.md` is the compatibility
denominator. The catalog currently reports 54 wired AMP/effect modules across
PixelBrain passes and microprocessor families. The experimental
`amp-registry.js` is not a capability inventory and cannot define completion.

Every cataloged AMP must have a versioned manifest:

```json
{
  "contract": "PB-AMP-ABI-v1",
  "ampId": "pixelbrain.facet",
  "version": "1.0.0",
  "execution": "COMPILE",
  "stage": "SHAPE_POST",
  "scope": ["SHAPE", "LAYER"],
  "inputs": [
    { "name": "geometry", "type": "SHAPE", "required": true }
  ],
  "parameters": [
    { "name": "facetCount", "type": "I32", "min": 3, "max": 32 }
  ],
  "output": { "type": "SHAPE" },
  "determinism": { "class": "PURE", "seedRequired": false },
  "cost": { "model": "LINEAR_IN_CELLS", "multiplier": 4 },
  "order": 40
}
```

### 17.1 Execution classes

- `COMPILE`: executes as a pure bounded compiler pass.
- `ANALYZE`: executes during compilation only when its declared resource input is
  present.
- `DESCRIPTOR`: emits validated immutable bytecode data for its owning runtime.

Runtime and world AMPs do not force SCDL source execution at runtime. They consume
typed descriptors produced by compilation.

### 17.2 Fixed stages

```text
SOURCE_ANALYSIS
-> CONSTRUCTION
-> SHAPE_PRE
-> SHAPE_POST
-> MASK
-> PAINT
-> LAYER_POST
-> PACKET_POST
-> RENDER
-> TIMELINE
-> RUNTIME_DESCRIPTOR
-> WORLD_DESCRIPTOR
```

Within a stage, a manifest declares stable conveyor-belt order. AMPs cannot reorder
themselves dynamically. Required inputs, capabilities, conflicts, determinism, and
cost are validated before execution.

### 17.3 SCDL invocation

```scdl
APPLY_AMP $faceted SHAPE {
  AMP pixelbrain.facet
  VERSION 1.0.0
  STAGE SHAPE_POST
  INPUT geometry $gem
  PARAM facetCount 8
}
```

Two activation forms are supported:

- `APPLY_AMP` records an explicit author choice.
- `SELECT_AMPS` runs deterministic relevance selection and freezes the selected,
  ordered plan into bytecode.

Irrelevant AMPs remain dormant. Compiler inspection explains both activation and
skip reasons.

No adapter may fabricate `ITEM-SPEC-v1` class, archetype, profile, or other metadata
merely to satisfy an AMP's existing internal gate. Tightly coupled AMPs must be
refactored behind truthful typed adapters.

### 17.4 AMP completion gate

Universal compatibility is complete only when:

- Every effect-catalog entry has a valid ABI manifest.
- Every manifest has a verified adapter or descriptor consumer.
- Every adapter has real execution evidence.
- Every descriptor has a real consuming boundary and contract test.
- The generated catalog reports SCDL compatibility separately from production
  wiring.
- Catalog CI prevents adding an AMP without SCDL compatibility metadata.
- The measured compatibility count equals the current catalog denominator. At the
  time of this design, that target is 54/54.

The earlier SCDL AMP-bridging design and PDR established a useful schema-backed
pilot concept, but their deliberate two-AMP scope is insufficient for this v2
requirement. SCDL v2 absorbs the mechanism into `PB-AMP-ABI-v1` and requires full
catalog coverage.

## 18. Resource Budgets

Every program has compiler defaults and may request stricter limits:

```scdl
BUDGET
  INSTRUCTIONS 200000
  GENERATED_SHAPES 10000
  RASTER_CELLS 1048576
  RECURSION_DEPTH 64
  FRAMES 240
```

Raising protected host limits requires an explicit compiler option; source cannot
grant itself more authority. Budget exhaustion fails compilation with the
instruction path, source span, declared bound, and measured demand. Partial output
is prohibited.

## 19. Diagnostics and Agent Tooling

Core commands are:

```text
scdl check
scdl format
scdl compile
scdl inspect
scdl explain
scdl capabilities --json
scdl opcodes --json
scdl amps list --json
scdl amps describe <amp-id> --json
scdl amps validate
scdl amps plan <file.scdl> --json
```

Machine diagnostics use a versioned result contract:

```json
{
  "contract": "SCDL-DIAGNOSTICS-v2",
  "ok": false,
  "languageVersion": 2,
  "compilerVersion": "2.0.0",
  "diagnostics": [{
    "code": "SCDL-PARSE-004",
    "severity": "ERROR",
    "phase": "parse",
    "message": "CIRCLE requires operand RADIUS.",
    "span": {
      "start": { "line": 18, "column": 3, "offset": 281 },
      "end": { "line": 22, "column": 1, "offset": 349 }
    },
    "instructionPath": ["SHAPE:$orb", "CIRCLE:0"],
    "expected": ["RADIUS PX"],
    "received": ["COLOR"],
    "relatedSymbols": ["$orb"],
    "fixes": [{
      "description": "Insert the missing radius operand.",
      "edits": [{
        "startOffset": 327,
        "endOffset": 327,
        "text": "RADIUS (PX 8)\n"
      }]
    }]
  }]
}
```

Diagnostic families are phase-specific:

```text
SCDL-LEX-*
SCDL-PARSE-*
SCDL-BIND-*
SCDL-TYPE-*
SCDL-TERM-*
SCDL-BUDGET-*
SCDL-GEOM-*
SCDL-ANIM-*
SCDL-AMP-*
SCDL-LOWER-*
SCDL-EMIT-*
```

Each diagnostic contains a stable code, severity, phase, precise span, instruction
path, expected and received forms, relevant symbol links, and optional advisory
fix edits. The compiler never applies those edits automatically.

The opcode registry is the generated source of truth for opcode IDs, textual
mnemonics, legal scopes, named operands, types, cardinality, declared defaults,
purity, cost, return type, version, capability, documentation, and valid examples.
Parser validation, formatter behavior, reference docs, and agent-facing discovery
derive from it where practical.

## 20. Output Package

A successful compile returns an immutable package containing:

```text
SCDL-BC-v2 canonical program
program identity and algorithm-version manifest
verified resource bounds
resolved capability and AMP plan
Shape / Mask / Layer / Timeline IR
derived frame packets
animation manifest
runtime/world AMP descriptors, when requested
optional raster caches
debug/source map
export manifests
diagnostics
```

Derived caches may be discarded and regenerated from the same bytecode. Persistent
and interoperable identity is bytecode-first.

## 21. Delivery Decomposition

This architecture is too large for one implementation plan. It is divided into
independently reviewed subprojects:

1. **Semantic-core vertical slice**
   - Version router
   - Tokenizer, CST, parser, symbols, types, units, diagnostics
   - Canonical formatter
   - Register bytecode and bounded evaluator
   - Typed mathematics plus pixel/circle construction, layer paint, and packet
     emission
2. **Geometry and painting kernel**
   - Primitive catalog, transforms, anchors, constraints, masks, booleans, layers,
     and compositing
3. **Generative mathematics**
   - Pure functions, finite control flow, collections, recurrences, seeded
     variation, and static cost verification
4. **Mathematical animation**
   - Timelines, tracks, formulas, poses, sampling, frame packets, and animation
     exporters
5. **Universal AMP ABI substrate**
   - `PB-AMP-ABI-v1`, invocation IR, stage order, relevance integration,
     certification harness, and catalog gate
6. **AMP family migrations**
   - Compile-time geometry and paint
   - Foundry and render fidelity
   - Character and image analysis
   - World, voxel, animation, and runtime descriptors
7. **Agent tooling and documentation**
   - Inspection commands, generated references, corpus examples, white paper,
     authoring guide, and agent repair-loop evaluation

Each subproject receives its own approved spec, implementation plan, verification,
and reviewable commit series. Later layers may consume only frozen contracts from
earlier layers.

## 22. First Milestone Acceptance Contract

The first implementation milestone is a vertical slice, not an isolated parser.
It is complete when:

1. `SCDL 2` selects the new compiler and a legacy file selects the old compiler.
2. A v2 source can declare typed values and evaluate prefix mathematics.
3. The source can construct a pixel and a circle as immutable shapes.
4. The source can paint those shapes into a named ordered layer.
5. The compiler emits canonical SCDL-BC-v2 bytecode and a real
   `PixelBrainAssetPacket`.
6. Formatting or comments do not change program identity.
7. Missing operands, bad units, unknown symbols, and exceeded budgets produce
   structured phase-specific diagnostics.
8. Invalid input never produces a partial packet and never escapes as an exception.
9. All current SCDL tests remain green.
10. Frozen legacy fixture packet IDs remain byte-identical.

## 23. Verification Strategy

### 23.1 Legacy invariance

- Run the existing SCDL suite after every milestone.
- Freeze packet IDs for representative v1 and v1.2 assets and every animation
  frame.
- Differentially compare legacy packets and exports before and after the version
  router.

### 23.2 Parser and language

- Fuzz arbitrary input and assert the public compiler never throws or hangs.
- Give every diagnostic-producing branch a firing test.
- Verify parse -> canonical format -> parse preserves the same typed program.
- Verify semantically equivalent sources produce identical bytecode.
- Mutation-test operand checks, scope checks, type checks, and budget guards.

### 23.3 Geometry

- Maintain pixel-level goldens for every primitive and raster policy.
- Test symmetry, translation, boundary inclusion, winding, degeneracy, and
  clipping invariants.
- Differentially compare optimized rasterizers against simple independent
  reference implementations.
- Inspect representative outputs at native size and nearest-neighbor zoom.

### 23.4 Computation and animation

- Repeat deterministic programs and compare bytecode, IR, packet, and raster
  digests.
- Test accepted and rejected termination proofs.
- Prove budget failure occurs before uncontrolled expansion.
- Verify exact rational sample times, easing values, loop boundaries, and frame
  identities.

### 23.5 AMPs

- Validate every ABI manifest against its exported module and declared consumer.
- Execute every compile-time adapter on a relevant fixture and prove a meaningful
  typed output.
- Validate every descriptor against the real consuming boundary.
- Test every AMP is dormant when irrelevant.
- Differentially compare existing hardcoded activation with relevance selection
  before any cutover.
- Preserve load-bearing conveyor-belt order.
- Gate CI on complete measured compatibility against the current 54-module
  catalog denominator; the required target is 54/54.

## 24. Risks and Controls

| Risk | Control |
|---|---|
| v2 destabilizes existing assets | Explicit version router and frozen legacy differential suite |
| Expressiveness permits runaway compilation | Static termination analysis, explicit budgets, no unrestricted loops or jumps |
| Numeric drift changes pixels | Exact rational/fixed-point math and versioned rounding/raster algorithms |
| Source syntax becomes ambiguous for agents | Opcode-first statements, named operands, prefix expressions, canonical formatter |
| Bytecode loses authoring intent | Bytecode emitted before evaluation and includes formulas, capabilities, and algorithm versions |
| AMP adapters fabricate incompatible metadata | Typed ports and truthful adapters; fabricated ITEM-SPEC metadata prohibited |
| AMP catalog grows beyond compatibility | Generated catalog CI requires an ABI manifest and verified route for every new entry |
| Runtime behavior violates compile-time-only law | Only immutable data descriptors cross to runtime; no SCDL source evaluator ships there |
| Documentation drifts from grammar | Generate parser-facing signatures and reference tables from the opcode registry |

## 25. Documentation Contract

After each implemented layer, update the SCDL compiler white paper and authoring
guide with behavior demonstrated by the real compiler. Examples and images must be
regenerable from checked-in SCDL sources. A capability may not be documented as
available merely because its syntax parses; it must have verified lowering and
output evidence.

## 26. Final Architectural Verdict

SCDL v2 is a deterministic, typed, compile-time mathematical language whose
primary purpose is pixel-art construction and animation. Its source form is
optimized for AI authorship through explicit opcode structure, while canonical
register bytecode preserves durable mathematical intent. Shape construction is
immutable, painting is explicit, animation is finitely sampled, and computation is
provably bounded. Universal AMP compatibility is a compiler-level ABI obligation
measured against the generated effect catalog, not a naming convention or registry
claim. SCDL v1/v1.2 remains frozen and byte-identical.
