# Design: SCDL Emits Real Per-Part `sdfDescriptors` (Phase 1)

**Status:** Approved by Vaelrix in conversation 2026-09-03; ready for PDR.
**Classification:** Architectural — populates an existing-but-empty schema field for the first time; establishes the shared substrate later phases build on.
**Prior art:** `2026-09-03-vixel-stroke-ir-v1-pdr.md` (shipped this session — the discrete contour system that patched the tearing bug's worst case); `qbit-phosphorylation.js` + `sdf-evaluator.js` (real, live, production infrastructure this phase feeds).

## 1. Problem

VRI's Pass 1 renders boundaries by storing an approximate `signedDistance` + `normal` per cell and locally extrapolating — no two cells are guaranteed to agree, which is the proven root cause of both a real tearing bug and a measured "vectorized instead of painted" softness (3.5–8.7% of cells, even at their own center, sampled this session). `qbit-phosphorylation.js` already has the right model — real `evaluateSDF` queries against one shared, globally-consistent field, plus a confidence-threshold commit — and it's live production code (the interactive PixelBrain editor's paint brush, `editor-command-stack.js:278`), not experimental. It's simply never been wired into VRI. The reason: `evaluateSDF` needs a real per-part SDF descriptor to query, and SCDL's compiler never builds one — `packet.sdfDescriptors` is a fully-normalized schema field (`pixelbrain-asset-packet.js:289`) that has been empty on every packet SCDL has ever compiled.

## 2. Decisions made (in conversation, one scope correction made twice)

1. **Scope, corrected during grounding — twice.** First pass: `circle` (true circles, `rx === ry` only), `rect`/`box`, `polygon`. Not `ring` (no matching `evaluateSDF` primitive — its `default` case would silently mis-evaluate an unrecognized type as a plain circle, a landmine, not a safe deferral). Not eccentric `ellipse` (`rx !== ry` — `evaluateSDF`'s `circle` case takes one `radius`, no lossless mapping exists). Not `sphere`/`path`/`line` (no existing `computeVectorIdentity` case at all — no per-cell SD math to draw the descriptor from).
   **Second correction, checking the actual normalizer body (not just its outer wrapper):** `polygon` also does not survive. `normalizeSDFPrimitive` (`pixelbrain-asset-packet.js:354-375`) processes every `params` key generically, assuming each value is a scalar or a plain `{x, y[, radius][, size]}` object — a `points` array is `typeof 'object'` too, so it silently collapses into a mangled single `{x:0, y:0}`, discarding every point. This is not a format adapter away; the shared normalizer would need extending to carry point-array data, which is its own real scope and its own representation decision (flatten to parallel arrays? something else?) — deferred, not guessed at here.
   **Final v1 scope: `circle` (true circles only) + `rect`/`box`.** Both map to `normalizeSDFPrimitive`'s existing `{x, y[, radius][, size]}` assumption cleanly and losslessly — confirmed by direct comparison, not assumed.
2. **Granularity: one descriptor per part**, `primitives` = that part's covered ops, matching `evaluateSDF`'s own shape (a primitives array plus optional operations) and SCDL's model of a part as a sequence of ops. **Correction: there is no `partId` field on the real `PB-SDF-v1` contract** (`pixelbrain-asset-packet.js:386-399`: `{contract, version, id, primitives, operations, domain?}` — no part-linkage field at all). Part-linkage is carried in `id` instead: `id: `sdf-${part.id}`` — a stable, documented naming convention a future consumer can rely on, not a real schema field.
3. **The `contract` field is not optional; it's a silent-discard guard.** `normalizePB_SDF_v1` returns an empty descriptor (`primitives: [], operations: [], id: 'empty'`) for any input where `input.contract !== PB_SDF_KIND` (`'PB-SDF-v1'`) — every emitted descriptor must set this explicitly or it vanishes with no error.
4. **Boolean composition: deferred.** SCDL's real boolean ops (subtract/etc., wired earlier this session in the amp-bridging work) are not translated into `evaluateSDF`'s operation tree yet — v1 emits a flat union (empty `operations`, or a `union` chain for multiple primitives) regardless of any authored boolean intent between ops.
5. **No duplicated parameter-extraction logic.** A new `opToSDFPrimitive(op)` factors out exactly the same `{cx, cy, rx, ry}` / `{x, y, w, h}` extraction `computeVectorIdentity`'s two relevant branches already do internally. `computeVectorIdentity` calls it instead of inlining the mapping twice.

## 3. Concrete parameter mapping (grounded against real code, not assumed)

| SCDL op | Raw params (`raster-core.js`) | `evaluateSDF` primitive | Mapping |
|---|---|---|---|
| `circle` (`rx === ry`) | `op.cx, op.cy, op.rx ?? op.radius` | `circle` | `{center: {x: cx, y: cy}, radius: rx}` — a plain `{x,y,radius}`-shaped param value, survives `normalizeSDFPrimitive` unchanged |
| `rect` | `op.x, op.y, op.w, op.h` | `box` | `{center: {x: x+w/2, y: y+h/2}, size: {x: w, y: h}}` — confirmed identical half-extent convention to `evaluateSDF`'s own `box` case, and `{x,y,size}`-shaped, also survives the normalizer unchanged |

`polygon` deliberately excluded — see §2.1's second correction.

## 4. Where it lands

`emit-packet.pass.js`'s `emitPacketPass(ast, _errors)` already loops `ast.parts` (confirmed, line 29) with full access to each part's original `.ops` at this stage — nothing upstream strips them. For each part: map its ops through `opToSDFPrimitive`, drop `null` results (the deferred types), and if at least one primitive survives, emit a real `PB-SDF-v1` descriptor onto the packet's `sdfDescriptors` array:

```js
{
  contract: 'PB-SDF-v1',   // required — normalizePB_SDF_v1 silently empties anything missing this
  version: '1.0.0',
  id: `sdf-${part.id}`,     // part-linkage convention; no partId field exists on the real contract
  primitives,                // from opToSDFPrimitive, nulls filtered
  operations: [],             // flat union in v1 — see §2.4
}
```

A part whose every op is a deferred type gets no descriptor at all — never a broken or silently-emptied one.

## 5. What this does not cover

- Wiring `sdfDescriptors` into VRI's renderer (Phase 2 — separate PDR).
- Multi-light reconciliation with `qbit-phosphorylation.js`'s single-light-direction model (Phase 3).
- Migrating the stroke-extraction system to read the same confidence signal instead of grid adjacency (Phase 4).
- `ring` (no matching `evaluateSDF` primitive), eccentric `ellipse` (no lossless single-radius mapping), `sphere`/`path`/`line` (no existing per-cell SD math to draw from), and `polygon` (would require extending the shared `normalizeSDFPrimitive` to carry point-array data — its own decision, deferred).
- Boolean-op-aware descriptors (§2.4).
- Any change to `evaluateSDF`/`sdf-evaluator.js` or `normalizeSDFPrimitive`/`normalizePB_SDF_v1` themselves — read-only dependencies, taken as given.

## Spec self-review

- Placeholder scan: none.
- Internal consistency: §2's two corrections (op-type scope narrowed from four to two; `partId`/`contract` shape fixed to match the real normalizer) are stated explicitly as corrections against what was verbally proposed first, not silently substituted — matching this session's own standing practice, applied to my own design this time, not just to code review.
- Scope check: two op types, one pass modified, one small shared helper. Smaller than the first draft, which is the point — verifying against the real normalizer cut real, unbuildable scope rather than adding it.
- Ambiguity check: the rect/box half-extent match and both normalizer-shape findings are stated as verified facts with the exact code compared, not assumed compatible.
