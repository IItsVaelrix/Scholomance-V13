# PDR: SCDL Emits Real Per-Part `sdfDescriptors` (Phase 1)
## Populating an Existing, Empty Schema Field — the Substrate the Phosphorylation Redesign Needs

**Status:** Draft. Design approved by Vaelrix in conversation 2026-09-03; not yet implemented.
**Classification:** Architectural | PixelBrain/SCDL | New Data Flow, Existing Contract | Phase 1 of a Multi-Phase Redesign
**Priority:** High — Vaelrix's explicit direction: this is the "herculean pillar" the rest of PixelBrain's rendering (fill, lighting, and tonight's shipped stroke system) should eventually sit on, not a nice-to-have.
**Primary Goal:** Make `packet.sdfDescriptors` — a fully-normalized, already-defined schema field that has been empty on every packet SCDL has ever compiled — actually populated with real per-part SDF descriptors, for the op types that can be represented losslessly today, so `evaluateSDF`/`qbit-phosphorylation.js`'s real-field-query model has something real to query. This PDR does not touch VRI's renderer, lighting, or the stroke system — it builds the ground floor those later phases stand on.
**Bytecode Search Code:** `SCHOL-ENC-BYKE-SEARCH-PDR-SCDL-SDF-DESCRIPTORS-V1-2026-09-03`

---

## Owner(s)
- **Codex:** the `opToSDFPrimitive` mapping contract (which op fields map to which `evaluateSDF` primitive params) — this is effectively extending how a schema-adjacent field gets populated, same category as other Codex-owned contract work tonight.
- **Gemini:** implementation — `emit-packet.pass.js`'s new descriptor-building step, the shared `opToSDFPrimitive` helper, `computeVectorIdentity`'s refactor to consume it, all new tests.
- **Claude:** no v1 scope. No UI surface touched.
- **Escalation owner** (cross-domain conflicts): Angel (repository owner).

## Context (seed — not the Executive Summary)
Tonight's tearing-bug investigation traced VRI's rendering inconsistency to a structural cause: Pass 1 approximates a continuous field per-cell, independently, with no shared source of truth. `qbit-phosphorylation.js` already solves this correctly elsewhere in the codebase — real `evaluateSDF` queries against one shared field, plus a confidence-threshold commit — but it has nothing to query for SCDL-compiled assets, because SCDL never builds the descriptor `evaluateSDF` needs. This PDR closes that gap, for the two op types that can be represented without approximation today.

## Target Integration Area
- `codex/core/pixelbrain/scdl/passes/emit-packet.pass.js` — new descriptor-building step inside the existing per-part loop.
- `codex/core/pixelbrain/scdl/render/raster-core.js` — new exported `opToSDFPrimitive(op)`; `computeVectorIdentity`'s `circle`/`ellipse` and `rect` branches refactored to call it instead of inlining the same parameter extraction.
- **Not modified:** `codex/core/pixelbrain/sdf-evaluator.js`, `codex/core/pixelbrain/pixelbrain-asset-packet.js` (the `normalizePB_SDF_v1`/`normalizeSDFPrimitive` normalizers) — read-only dependencies; their exact existing shape is the constraint this PDR designs against, not something it changes.
- **Not modified:** `codex/core/pixelbrain/vixel/` (VRI's renderer — Phase 2), `codex/core/pixelbrain/qbit-phosphorylation.js` (Phase 2), `codex/core/pixelbrain/vixel/stroke-extractor.js` (Phase 4).

## Core Concept
Every part's ops already carry the real geometric parameters (`raster-core.js`'s `computeVectorIdentity` already reads `op.cx`/`op.cy`/`op.radius` for circles, `op.x`/`op.y`/`op.w`/`op.h` for rects, once per cell, to stamp an approximate per-cell signed distance). This PDR captures those same parameters once per op, in the shape `evaluateSDF` actually needs, and attaches them to the compiled packet. Nothing about SCDL's geometry model changes; a real, reusable descriptor is kept instead of being computed and discarded per cell.

## Implementation Philosophy
Grounded scope over complete scope. Two op types (`circle` restricted to `rx === ry`, `rect`/`box`) were verified — not assumed — to round-trip losslessly through the existing `normalizePB_SDF_v1`/`normalizeSDFPrimitive` normalizers. Three more (`ring`, eccentric `ellipse`, `polygon`) were considered and explicitly excluded, each for a specific, named, checked reason, not a vague "later." This is deliberate: Vaelrix stalled on this exact system months ago specifically by trying to resolve the whole vector representation at once ("vector framing"). This PDR is scoped to ship the part that's actually provably correct today.

## Ownership & Law Compliance
Every file this PDR writes appears in §7 with its owning agent. No new schema is invented — `PB-SDF-v1` already exists and is Codex-owned (`pixelbrain-asset-packet.js:351`); this PDR populates it, following its existing normalizer exactly rather than working around it. Determinism per `VAELRIX_LAW.md` Law 6: identical compiled packet → byte-identical `sdfDescriptors`, since `opToSDFPrimitive` is a pure function of an op's own already-deterministic fields.

---

# 1. Executive Summary

`packet.sdfDescriptors` is a real, normalized schema field (`pixelbrain-asset-packet.js:289`) that has never been populated by SCDL's compiler — confirmed empty on every real fixture checked tonight. `qbit-phosphorylation.js`, live production code in the interactive PixelBrain editor, already models exactly the right fix for VRI's proven rendering-inconsistency bug (real `evaluateSDF` field queries instead of per-cell approximation), but has nothing to query for SCDL assets. This PDR closes that gap.

Scope was corrected twice during grounding, each time by checking real code rather than trusting the first plausible answer: the original four-op-type plan (`circle`/`ellipse`, `rect`, `polygon`, `ring`) narrowed to two (`circle` restricted to true circles, `rect`/`box`) after finding `evaluateSDF` has no `ring` primitive at all (its `default` case would silently mis-evaluate one as a circle) and that `normalizeSDFPrimitive`'s generic `params` handling cannot carry a polygon's point array without silently mangling it into a single point. Both corrections are recorded, not smoothed over — this is the same discipline this session applied to the audit's own MAJOR #2 finding and to the amp-bridging PDR's pilot-amp pick.

Blast radius: one new pure helper, one small pass addition, zero changes to `evaluateSDF` or the packet normalizers themselves — their existing shape is the constraint this PDR designs against.

# 2. Out of Scope / Non-Goals

- **Wiring `sdfDescriptors` into VRI's renderer.** Phase 2, separate PDR — this PDR only populates the field.
- **`qbit-phosphorylation.js` multi-light reconciliation.** Phase 3.
- **Migrating the stroke system to the same confidence signal.** Phase 4.
- **`ring`.** No matching `evaluateSDF` primitive; its `default` case would silently mis-evaluate an unrecognized type as a plain circle — a landmine, not a safe deferral, so explicitly excluded rather than shipped wrong.
- **Eccentric `ellipse` (`rx !== ry`).** `evaluateSDF`'s `circle` case takes one `radius`; no lossless mapping exists without inventing an approximation, which is exactly the class of "guess the framing" mistake this PDR is designed to avoid.
- **`polygon`.** `normalizeSDFPrimitive`'s generic per-key `params` handling assumes each value is a scalar or a plain `{x,y[,radius][,size]}` object; a `points` array silently collapses into one mangled point. Fixing this requires extending the shared normalizer itself — real, separate scope with its own representation question.
- **`sphere`/`path`/`line`.** No existing `computeVectorIdentity` case for any of them — no per-cell SD math exists to build a descriptor from in the first place.
- **Boolean-op-aware descriptors.** SCDL's real boolean ops (subtract/etc.) are not translated into `evaluateSDF`'s operation tree; v1 emits a flat union regardless of authored boolean intent between ops.
- **Any change to `evaluateSDF`, `normalizePB_SDF_v1`, or `normalizeSDFPrimitive`.** Read-only dependencies.

# 3. Spec Sheet

## 3.1 Functional Spec

**F1 — `opToSDFPrimitive(op)`, shared extraction.** New exported function in `raster-core.js`. For `type === 'circle' || type === 'ellipse'` where `op.rx === op.ry` (or only `op.radius` is set — a true circle either way): returns `{ type: 'circle', params: { center: { x: op.cx, y: op.cy }, radius: op.rx ?? op.radius } }`. For `type === 'ellipse'` with `op.rx !== op.ry`: returns `null` (deferred, §2). For `type === 'rect'`: returns `{ type: 'box', params: { center: { x: op.x + op.w/2, y: op.y + op.h/2 }, size: { x: op.w, y: op.h } } }`. Every other type: returns `null`. *Acceptance:* a circle op and a rect op each produce a primitive whose `params` values are plain `{x,y[,radius][,size]}` objects (never arrays, never nested beyond one level) — verified by round-tripping through the real `normalizeSDFPrimitive` and asserting no data loss.

**F2 — `computeVectorIdentity` refactored to consume F1.** The `circle`/`ellipse` and `rect` branches (`raster-core.js:76-154`) call `opToSDFPrimitive(op)` internally to get `{center, radius}` / `{center, size}` instead of inlining the same extraction a second time. *Acceptance:* existing `computeVectorIdentity` tests (per-cell `signedDistance`/`normal`/`tangent`/`curvature` output) are byte-identical before and after this refactor — the refactor changes where the extraction lives, not what it computes.

**F3 — `emitPacketPass` builds real `sdfDescriptors`.** For each part in `ast.parts`, map its ops through `opToSDFPrimitive`, filter `null`s, and if at least one primitive survives, push `{ contract: 'PB-SDF-v1', version: '1.0.0', id: `sdf-${part.id}`, primitives, operations: [] }` onto the packet's `sdfDescriptors` array. *Acceptance:* (a) a part built entirely from a `circle` op produces exactly one descriptor whose `primitives[0].type === 'circle'`; (b) a part built entirely from `path`/`line`/`sphere` ops produces no descriptor at all — not an empty or broken one; (c) the produced descriptor, run through the real `normalizePB_SDF_v1`, is **not** silently emptied (i.e., `result.id !== 'empty'`) — this is the specific regression the `contract` field guard makes possible, and the acceptance test asserts against the real normalizer, not a mock of it.

## 3.2 Non-Functional Spec

- **Determinism:** identical compiled AST → byte-identical `sdfDescriptors`, every run — `opToSDFPrimitive` reads only an op's own already-deterministic fields.
- **No existing-behavior regression:** `computeVectorIdentity`'s existing per-cell output (consumed by VRI's current Pass 1, untouched by this PDR) must be byte-identical before and after the F2 refactor.
- **Round-trip fidelity:** every descriptor this PDR emits, run through the real `normalizePB_SDF_v1`/`normalizeSDFPrimitive`, must come back with its `primitives` intact — checked directly against the actual normalizer functions, not assumed compatible from reading their source.

## 3.3 Contracts

Real example, `circle 15.5 10 radius 7.5` (the exact hood boundary from tonight's stroke-IR work, `void_acolyte.scdl:75`):

```json
{
  "contract": "PB-SDF-v1",
  "version": "1.0.0",
  "id": "sdf-hood",
  "primitives": [
    { "type": "circle", "params": { "center": { "x": 15.5, "y": 10 }, "radius": 7.5 } }
  ],
  "operations": []
}
```

**Deferred to follow-up PDRs:** `ring`/eccentric-`ellipse`/`polygon` support (each needs its own resolved representation question, per §2); VRI renderer integration (Phase 2); multi-light reconciliation (Phase 3); stroke-system migration (Phase 4).

# 4. Change Classification

- **architectural** — populates a real schema field for the first time across the whole compile pipeline; the actual substrate three later phases depend on.
- **structural** — one new shared helper; one existing function refactored to use it instead of duplicating logic.
- **behavioral** — `packet.sdfDescriptors` goes from always-`[]` to real content for circle/rect-only parts. No consumer reads this field yet (Phase 2 is the first), so no downstream behavior changes anywhere in this PDR.
- Not **cosmetic**.

# 5. Assumptions and Unknowns

## 5.0 Grounds

| Claim | Grounds | Basis |
|---|---|---|
| `packet.sdfDescriptors` exists, normalized, always empty from SCDL | measured | `pixelbrain-asset-packet.js:289`; confirmed `[]` on two real compiled fixtures |
| `evaluateSDF` has exactly 5 primitive types: circle, box, capsule, line, polygon — no ring | measured | `sdf-evaluator.js`, every `case '...'` grepped directly |
| `evaluateSDF`'s unrecognized-type default silently treats it as a circle | measured | `sdf-evaluator.js:85-86`, `default: d = length(sub(pp, pr.center||{x:0,y:0})) - (pr.radius||1)` |
| `normalizeSDFPrimitive` cannot carry a `points` array without corrupting it | measured | `pixelbrain-asset-packet.js:354-366`, generic per-key `{x,y,radius?,size?}` extraction applied to any object-typed param value |
| The real `PB-SDF-v1` contract has no `partId` field | measured | `pixelbrain-asset-packet.js:386-399`, full shape read directly |
| `normalizePB_SDF_v1` silently empties any descriptor missing `contract: PB_SDF_KIND` | measured | `pixelbrain-asset-packet.js:387-389` |
| `computeVectorIdentity`'s circle/rect branches read exactly the op fields F1 needs | measured | `raster-core.js:76-154`, read directly, both branches |
| `qbit-phosphorylation.js` is real, live production code | measured | `editor-command-stack.js:278`, a real call site in the interactive editor's undo/redo stack |
| This is the correct Phase 1 of the larger redesign, and the larger redesign is worth doing | **judgement**, Vaelrix's | stated directly in conversation; grounded by this session's own measured tearing-bug root cause, but the strategic call that this is a "pillar" is a design judgement, not a measured fact |

## 5.1 Assumptions

- A1 *(architectural)*: encoding part-linkage into `id` (`sdf-${part.id}`) rather than a real schema field is an acceptable convention for Phase 1 — Phase 2 (the first real consumer) will confirm whether this is sufficient or whether a real `partId` field should be proposed as a `SCHEMA_CONTRACT.md` change at that point.
- A2 *(measured)*: a part's ops are only ever additive in today's SCDL (no boolean subtract/intersect *within* a single part's own op list, only *between* named parts) — confirmed by re-reading `lower-booleans.js` from tonight's amp-bridging work, which operates across parts, not within one. This is what makes "flat union of a part's own ops" a correct default for v1, not just a convenient one.

## 5.2 Unknowns

- U1: whether Phase 2 (VRI renderer integration) will find that `id: sdf-${part.id}` convention insufficient once a real consumer exists — deliberately not over-engineered now, per A1.
- U2: whether extending `normalizeSDFPrimitive` to carry polygon data (unblocking a future polygon PDR) is better done as a targeted addition or as part of a broader look at the normalizer's generic-params assumption, which may have the same blind spot for other future primitive types (e.g. `capsule`'s `p1`/`p2` point pair) — not investigated here, flagged for whoever picks up polygon support next.

# 6. Open Questions / Escalations

**ESCALATION:** Should `SCHEMA_CONTRACT.md` be updated now to document that `PB-SDF-v1` descriptors use an `id`-encoded part-linkage convention (`sdf-<partId>`), or wait until Phase 2 proves that convention actually works for a real consumer before writing it down? Option A: document the convention now, as part of this PDR, since it's a real design decision being made. Option B: wait for Phase 2's validation first, avoiding documenting a convention that might need to change. Recommendation: Option B — this session's own standing pattern (freeze what's proven) argues for not writing down a convention until something actually depends on it. Owner: Codex.

# 7. Architecture / File Map

```
codex/core/pixelbrain/scdl/
  render/
    raster-core.js            MOD  Gemini  new opToSDFPrimitive(op) (F1); computeVectorIdentity's
                                            circle/ellipse + rect branches refactored to call it (F2)
  passes/
    emit-packet.pass.js       MOD  Gemini  per-part sdfDescriptors population (F3)
tests/codex/core/pixelbrain/scdl/
  render/
    opToSDFPrimitive.test.js       NEW  Gemini  F1: circle/rect mapping correctness, ellipse
                                                 rx!==ry returns null, unsupported types return null,
                                                 round-trip through the real normalizeSDFPrimitive
    computeVectorIdentity.test.js  MOD  Gemini  F2: existing per-cell output byte-identical before/
                                                 after the refactor (regression guard)
  emit-packet.sdf-descriptors.test.js  NEW  Gemini  F3: circle-only part -> one descriptor;
                                                     path/line-only part -> no descriptor;
                                                     produced descriptor survives real
                                                     normalizePB_SDF_v1 without being emptied
```

Dependency direction: `emit-packet.pass.js` → `raster-core.js:opToSDFPrimitive` (pure). `computeVectorIdentity` also depends on `opToSDFPrimitive` now, but its own consumers (the per-cell rendering path) are unchanged — F2 is an internal refactor, not a new edge in the dependency graph anyone outside this file needs to know about.

# 8. Step-by-Step Implementation Plan

**Phase A — `opToSDFPrimitive` (Gemini, ~1.5 hours).** Milestone: F1 implemented and tested standalone, including the real-normalizer round-trip check. Exit criteria: `opToSDFPrimitive.test.js` green.

**Phase B — `computeVectorIdentity` refactor (Gemini, ~1 hour). Requires Phase A.** Milestone: circle/rect branches call the shared helper; existing behavior provably unchanged. Exit criteria: `computeVectorIdentity.test.js`'s byte-identical regression assertion passes; full existing SCDL suite (286 per tonight's last full run) stays 286/286.

**Phase C — `emit-packet.pass.js` integration (Gemini, ~1.5 hours). Requires Phase A.** Milestone: real `sdfDescriptors` on compiled packets for circle/rect parts. Exit criteria: `emit-packet.sdf-descriptors.test.js` green, including the real-normalizer non-empty assertion (F3c).

Each phase is independently shippable; nothing downstream consumes `sdfDescriptors` yet, so there is no rollout risk beyond the field itself being populated.

# 9. Code Examples — Pivotal Changes

**9.1 `opToSDFPrimitive` — the shared extraction (`raster-core.js`):**

```js
export function opToSDFPrimitive(op) {
  const type = op.op || op.type;

  if (type === 'circle' || type === 'ellipse') {
    const rx = op.rx ?? op.radius ?? 1;
    const ry = op.ry ?? op.radius ?? 1;
    if (rx !== ry) return null; // eccentric ellipse — no lossless evaluateSDF mapping, deferred
    return {
      type: 'circle',
      params: { center: { x: op.cx, y: op.cy }, radius: rx },
    };
  }

  if (type === 'rect') {
    return {
      type: 'box',
      params: {
        center: { x: op.x + op.w / 2, y: op.y + op.h / 2 },
        size: { x: op.w, y: op.h },
      },
    };
  }

  return null; // ring, polygon, sphere, path, line — all deferred, see PDR §2
}
```

**9.2 `computeVectorIdentity`'s circle branch, refactored to consume it (was: inlined `cx`/`cy`/`rx`/`ry` extraction):**

```js
// raster-core.js — inside computeVectorIdentity(op, px, py)
if (type === 'circle' || type === 'ellipse') {
  const prim = opToSDFPrimitive(op);
  const cx = op.cx, cy = op.cy;
  const rx = op.rx ?? op.radius ?? 1;
  const ry = op.ry ?? op.radius ?? 1;
  // ...existing per-cell signedDistance/normal/tangent/curvature math, UNCHANGED —
  // only the up-front extraction is shared now; F2's acceptance test guards this
  // stays byte-identical.
}
```

**9.3 `emitPacketPass`'s new descriptor-building step:**

```js
// emit-packet.pass.js, inside the existing `for (const part of ast.parts)` loop
const primitives = (part.ops || [])
  .map(opToSDFPrimitive)
  .filter((p) => p !== null);

if (primitives.length > 0) {
  sdfDescriptors.push({
    contract: 'PB-SDF-v1',        // required — see PDR §2.0 grounds, silently discarded otherwise
    version: '1.0.0',
    id: `sdf-${part.id}`,
    primitives,
    operations: [],                // flat union in v1
  });
}
```

# 10. Glossary

- **`PB-SDF-v1`** — the existing, real, previously-unpopulated packet contract this PDR fills in. Owned by `pixelbrain-asset-packet.js`.
- **`sdfDescriptors`** — the packet field, an array of `PB-SDF-v1` descriptors, one per part with representable geometry.
- **`opToSDFPrimitive`** — the new shared function mapping one SCDL op to one `evaluateSDF`-compatible primitive, or `null` if the op type isn't representable yet.
- **Lossless mapping** — a representation that round-trips through the real normalizer with no data discarded or corrupted; the bar every included op type in this PDR was checked against.
- **Silent-discard guard** — `normalizePB_SDF_v1`'s behavior of returning an empty descriptor for malformed input rather than throwing; the reason `contract` must be set explicitly.

# 11. Q&A — Implementation Concerns

**Q1: Why not just approximate the ellipse/ring/polygon cases and fix them later?** Because "approximate now, fix later" is exactly the failure mode explored across this whole session (per-cell approximation is the root cause of the tearing bug this larger redesign exists to fix). Shipping an approximate SDF descriptor for a curve type would plant a second, quieter version of the same disease inside the fix for the first one.

**Q2: Won't leaving 5 op types unrepresented mean most real assets get no descriptor at all?** For now, yes for parts built purely from unsupported types — and that's honest, not a regression, since `sdfDescriptors` has never had anything in it for any asset until this PDR. A part with a `circle` or `rect` op gets a real descriptor today; everything else waits for its own correctly-scoped follow-up rather than a guessed one.

**Q3: How was "circle/rect round-trip losslessly, polygon doesn't" actually verified, not just reasoned about?** By reading `normalizeSDFPrimitive`'s real body (`pixelbrain-asset-packet.js:354-375`) and checking what it does to each shape of `params` value directly — an object with `{x,y,radius}` survives its per-key extraction; an array does not, since arrays have no `.x`/`.y` and the function has no array-handling branch at all.

**Q4: Does the `id: sdf-${part.id}` convention collide if two parts share an id?** SCDL part ids are already required to be unique per asset (existing SCDL grammar constraint, unrelated to this PDR) — this convention inherits that guarantee rather than introducing a new uniqueness requirement.

**Q5: What happens to a descriptor's `primitives` order if a part has multiple circle/rect ops?** Preserved in the part's own authored op order (`Array.prototype.map` is order-preserving) — matches painter-order semantics already used elsewhere in this pipeline (e.g., tonight's `apply-amps` pass design used the same "source order = evaluation order" convention).

# 12. QA Plan

```bash
npx vitest run tests/codex/core/pixelbrain/scdl/render/opToSDFPrimitive.test.js \
  tests/codex/core/pixelbrain/scdl/render/computeVectorIdentity.test.js \
  tests/codex/core/pixelbrain/scdl/emit-packet.sdf-descriptors.test.js

npx vitest run tests/codex/core/pixelbrain/scdl/   # full existing suite — must stay 286/286
```

Example runnable test (F3c, the real-normalizer round-trip — the specific regression this PDR's own grounding caught):

```js
import { normalizePB_SDF_v1 } from '../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

it('a real emitted descriptor survives normalizePB_SDF_v1 without being silently emptied', () => {
  const source = `asset probe canvas 16x16\npalette { a = #111111 }\npart body material stone { circle 8 8 radius 4 a }\nexport json`;
  const result = compileSCDL(source, {});
  const descriptor = result.packet.sdfDescriptors[0];
  const normalized = normalizePB_SDF_v1(descriptor);
  expect(normalized.id).not.toBe('empty');
  expect(normalized.primitives).toHaveLength(1);
  expect(normalized.primitives[0].type).toBe('circle');
});
```

# 13. Regression Risks and Specific Retest Checklist

| Risk | Retest |
|---|---|
| `computeVectorIdentity`'s refactor changes existing per-cell output | Byte-identical regression test (F2); full SCDL suite stays 286/286 |
| A malformed descriptor silently discarded by the real normalizer, undetected | F3c's explicit `normalizePB_SDF_v1` round-trip test, run against the real function, not a mock |
| `opToSDFPrimitive` returns something for an op type it shouldn't (silently including a deferred type) | Explicit test asserting `null` for ring/polygon/sphere/path/line/eccentric-ellipse inputs |

# 14. Rollout Plan

- **Incomplete-but-safe:** `sdfDescriptors` goes from always-empty to sometimes-populated. Nothing reads this field yet, so there is no behavioral surface to regress beyond the field's own content.
- **No flag needed** — no consumer exists yet to gate.
- **Rollback:** revert the merge commit. No runtime state, no migration.
- **Next step:** Phase 2 (VRI renderer integration via `qbit-phosphorylation.js`) becomes buildable once this ships — its own PDR, its own eyes-on review given the Verdict's own standing rule about visible rendering changes.

# 15. Definition of Done

- [ ] `npx vitest run tests/codex/core/pixelbrain/scdl/` — 286/286, plus this PDR's new tests.
- [ ] F2's byte-identical regression assertion passes.
- [ ] F3c's real-normalizer round-trip test passes (not emptied, primitives intact).
- [ ] Explicit negative tests confirm `null` for every deferred op type (ring, eccentric ellipse, polygon, sphere, path, line).
- [ ] §6's escalation answered (whether to document the `id` convention in `SCHEMA_CONTRACT.md` now or after Phase 2).
- [ ] This PDR committed with its bytecode search code; PIR filename reserved (§18).

# 16. Final Architectural Verdict

**Complete with acceptable risk, within its stated scope.**

The scope this PDR actually ships is smaller than what was first proposed — twice, both times because checking the real normalizer code found a genuine incompatibility rather than an assumed one. That's the right outcome for a phase whose entire job is to be the trustworthy foundation for three more phases: shipping two op types that are *provably* correct is more valuable here than shipping five where three are silently wrong or silently discarded. The larger claim — that this whole redesign is a "pillar," not a nice-to-have — remains judgement (§5.0), not something this PDR itself proves; what this PDR does prove is that the first concrete step toward it is buildable, small, and grounded in code that was actually read, not assumed.

# 17. References

- `2026-09-03-vixel-stroke-ir-v1-pdr.md` — the session's prior work whose eyes-on check surfaced the root-cause investigation this PDR is downstream of.
- `docs/superpowers/specs/2026-09-03-scdl-sdf-descriptors-v1-design.md` — the design doc this PDR formalizes, including both scope corrections in full.
- `codex/core/pixelbrain/pixelbrain-asset-packet.js:289,351,354-410` — the real `PB-SDF-v1` contract, its normalizers, and the silent-discard guard this PDR designs around.
- `codex/core/pixelbrain/sdf-evaluator.js` — `evaluateSDF`'s real primitive-type set (circle/box/capsule/line/polygon), read-only dependency.
- `codex/core/pixelbrain/scdl/render/raster-core.js:73-234` — `computeVectorIdentity`'s existing per-op-type signed-distance math this PDR reuses rather than reimplements.
- `codex/core/pixelbrain/qbit-phosphorylation.js`, `codex/core/pixelbrain/editor-command-stack.js:278` — the real, live phosphorylation model this substrate is being built to eventually feed.
- `docs/scholomance-encyclopedia/Scholomance LAW/VAELRIX_LAW.md` — domain map, escalation format, determinism law.

# 18. Post-Implementation Report Handoff

Required PIR: `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260903-SCDL-SDF-DESCRIPTORS-V1.md`

The PIR must record:
- Full test results, including the 286-test SCDL regression count.
- The real-normalizer round-trip result (F3c) — not just "passed," the actual descriptor shape checked.
- §6's escalation resolution.
- Confirmation of readiness for Phase 2: does `sdfDescriptors` as shipped actually give `qbit-phosphorylation.js` enough to query for a real asset, checked against one real fixture, not assumed.

A PDR that ships without this PIR is incomplete.
