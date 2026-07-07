# PB-Semantics / SemQuant

TurboQuant-inspired semantic type unification for PixelBrain authoring inputs.

## Purpose

Unify meaning across different authoring sources (SCDL, SDF, Construction specs, Aseprite layers, Shape Grammars, etc.) into a shared vocabulary of roles, parts, materials, effects, construction guides, and provenance *before* deterministic lowering to cells and packets.

## Phase 1 Status (Thin Slice)

- Core IR node shape: `PixelBrainIRNode`
- `semanticUnifierPass(input)` — attaches `TurboQuantAnnotation`-style annotations
- SCDL adapter + integration in compiler (after parse/validate, annotations attached back)
- Construction adapter stub (demonstrates extensibility)
- Propagation of `partId`, `role`, `sourceOpId`, `material` through vector expansion → cells → packet
- PB-SEM-* diagnostics (e.g. MISSING_MATERIAL_BINDING for glow without material)
- Lowering steps recorded
- Deterministic, no bloat on packet geometry hash unless opted in

## Usage

```js
import { scdlAstToIR, semanticUnifierPass, constructionSpecToIR } from './semantic/index.js';

// From SCDL
const ir = scdlAstToIR(parsedAst);
const unified = semanticUnifierPass(ir);

// Direct construction
const consIr = constructionSpecToIR(myConstructionSpec);
const unifiedCons = semanticUnifierPass(consIr);
```

## Current Annotations

Each node gets `annotations: [{ domain, semanticType, canonicalType, confidence, sourceRefs, ... }]`

Supported domains (growing): role, material, effect, part, construction, provenance.

## Next (beyond thin slice)

- More adapters (SDF, full Aseprite layer parser, shape grammar)
- Boolean op semantic preservation rules
- Consumption in RegionFillAMP, fidelity, etc.
- Sidecar semantic metadata on packets (optional)
- LSP / IDE support for the types

See the originating design document for the full vision.
