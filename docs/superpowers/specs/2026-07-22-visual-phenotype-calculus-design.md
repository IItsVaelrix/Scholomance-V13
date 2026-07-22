# Design: Visual Phenotype Calculus

**Date:** 2026-07-22
**Status:** draft — revised after owner review
**Author:** Damien + Claude
**Umbrella:** Compose Intent Calculus (this spec is the *visual phenotype* layer; see §1.3)
**Builds on:** `codex/core/semantic-calculus/` (seal, kinds, receipts, predicates), `codex/core/pixelbrain/scdl/` (pass compiler), `src/core/scd64/` (8-slot semantic code), `codex/core/diagnostic/BytecodeHealth.js`, `PHENOTYPIC-IDEAL-v1` (phenotype gap vocabulary)

## 1. Problem

**Interpretation drift.** Design intent is stated in prose, implemented by someone (increasingly an agent) who reads it, and nothing mechanical ever compares the result to the intent. The intent is not wrong — it is *ignorable*, because it exists nowhere a machine can check it.

The goal is to make intent mathematical so it cannot be ignored: a rendered surface must demonstrably *be* what its intent declared, or the gate refuses it.

### 1.1 What this is not

Encryption was the entry point for this design and is explicitly rejected. A cipher is a bijection over bytes; if the gate can decrypt a packet, that proves **provenance**, not fidelity. An agent that calls the sanctioned encoder with the wrong intent value emits a perfectly decryptable packet expressing exactly the wrong thing — the seal verifies, the gate opens, the drift ships. Interpretation drift is the one failure a cipher structurally cannot see.

SCD64 is likewise unusable as a cipher, and the codebase already says so at `codex/core/semantic-calculus/types.ts:417`: it "hashes 8 canonical taxonomy strings into 8 semantic slots... a classification code with no parameter for arbitrary content." Not injective — you cannot recover a scene from 64 hex characters.

What SCD64 *is*: eight orthogonal semantic slots with block-wise comparison (`compareSCD64ByBlocks`). A coordinate system for measurement, where a mismatching block **names the axis on which the surface departed from its declared coordinate**.

### 1.2 Non-goals — what v1 cannot prove

This system proves exactly one proposition:

> The rendered surface visually occupies the declared coordinate.

It does **not** prove:

- correct text or semantic meaning
- correct interaction behaviour
- keyboard navigation or focus order
- event wiring — whether a button performs the intended action
- disabled / loading / error states
- responsive intent across all breakpoints
- whether the correct information was selected

A gate trusted for things it does not check is its own absence-reads-as-consent failure. These exclusions are normative: no verdict from this system may be cited as evidence about any of them.

**Known measurement blind spot.** Contrast is read from the computed fg/bg pair rather than composited pixels (§3.3), which buys orthogonality against stacking at the cost of blindness to compositing — an element dimmed by a translucent overlay measures as though the overlay were absent. Effective composited contrast belongs to the semantic/accessibility phenotype layer. This system must not be cited as an accessibility verdict.

### 1.3 Position under the umbrella

`PHENOTYPIC-IDEAL-v1` already gives this repo the phenotype vocabulary — `2026-07-19-phenotypic-idealism-design.md:23` reads "phenotype gap (ideal vs observed)", and `tests/qa/features/phenotypic-ideal-compose.test.js` exists. This spec is the **visual phenotype** layer of a broader calculus:

| Layer | Derivation source |
|---|---|
| **Visual phenotype (this spec)** | pixels and computed styles |
| Behavioural phenotype | browser events and state transitions |
| Semantic phenotype | accessible tree and content assertions |
| Performance phenotype | frame timings and resource measurements |

Compose Intent Calculus is the umbrella. It does not claim totality in its first implementation.

## 2. The invariant

Every mechanism here is an instance of one rule:

> **Every claim carries two independent derivations, and the second must come from a different source than the first.**

| Claim | Derivation A | Derivation B |
|---|---|---|
| The surface expresses the intent | authored intent packet | measurement of the rendered page |
| The intent was verified | compile output | BytecodeHealth receipts |
| The claim was checked | declared (predicted version byte) | measured (confirmed version byte) |
| The intent packet reflects the owner | agent-drafted `Hypothesis` | owner ratification |

Where the invariant holds, the check can fail. Where it is violated — same substrate on both sides — the check is ceremony. §7 lists every violation caught during design.

## 3. The measurement vector

The SCD64 is a **pure measurement fingerprint of the rendered surface**. It carries no claims. This separation is load-bearing and is the correction to the first draft, which packed a derived verdict in beside its own inputs and thereby made eight slots *look* orthogonal while one was a function of the other seven.

| Slot | Content | Measured from rendered surface | Canonical terms | Boundary source |
|---|---|---|---|---|
| 0 | version byte + **AuthorityProfile id** | — (identity, not measurement) | profile id | §4.3 |
| 1 | Luminance relationship | computed fg/bg pair → L* ratio | `fail` / `ui` / `body` / `high` | WCAG 3.0 / 4.5 / 7.0 |
| 2 | Stacking | computed z-index + stacking-context ancestry | `base` / `above` / `overlay` / `system` | `src/data/stacking_tiers.js` |
| 3 | Size | `getBoundingClientRect` area ÷ viewport | `glyph` / `control` / `panel` / `region` / `surface` | log-spaced |
| 4 | Chromaticity | computed colour → LCh **hue angle** → nearest palette role | palette role name, `neutral`, or `off-palette` | palette table + hue tolerance |
| 5 | Shape | border-radius ÷ min(w,h), aspect, clip-path | `rect` / `round` / `pill` / `circle` / `notched` | ratio thresholds |
| 6 | Density | ink ratio: non-background px ÷ bbox area | `sparse` / `measured` / `dense` / `packed` | ratio thresholds |
| 7 | Motion | displacement + opacity Δ per second, sampled | `still` / `breath` / `pulse` / `drive` | ratio thresholds |

Slots 1–7 are the evidence axes and **must be mutually orthogonal**. Orthogonality is constructed by the isolation contract (§3.3) and verified by the pre-flight matrix (§3.4); §9 criteria 3 and 5 are its falsifiers.

### 3.1 Slot 0 carries profile identity, not authority

Slot 0 in `generateSCD64FromSlots.ts` is not a plain hash — it is `versionByte + hash.slice(0,6)`, and the glossary carries both `versionByte` and `predictedVersionByte`. That structure is retained, repurposed:

- the **version byte** marks the whole code predicted vs. confirmed
- the **six hash characters** identify the `AuthorityProfile` in force

This seals the ranking function into the measurement itself. Retuning weights changes the profile id, which changes the code, so historical verdicts cannot silently mutate under a weight change.

**Slot 0 is a discriminator, never the authoritative identity.** Six hash characters is 24 bits — adequate to tell adjacent profiles apart at a glance, inadequate as the sole record of which ranking function produced a verdict. Birthday collision arrives around 2¹² ≈ 4,000 profiles, which is reachable over a long project life and is *actively accelerated* by `scope: 'component' | 'scene'`, since scene-scoped profiles multiply the population.

The full profile digest is therefore carried in three places alongside the compact id: `BytecodeHealth.context`, the observation receipt, and the profile registry. **The compact id and the full digest must agree, and disagreement is a hard failure** — the act cannot claim confirmation, exactly as a missing receipt cannot (§5.5). Without this, a future collision would make two distinct profiles appear historically identical and silently void criterion 8. An element whose surface was never measured keeps the *predicted* byte, and a predicted byte reaching production is itself a violation — which makes "nobody checked" exactly as loud as "the check failed."

### 3.2 Quantization

**Quantize on boundaries that already exist, and on ratios, never absolute pixels.** Absolute px means every responsive breakpoint rewrites the blocks and the code stops meaning anything. Log-spaced area means a 10% nudge never crosses a boundary but a 2× change always does. Shape uses radius as a *fraction* of the element, so a pill stays a pill at any scale.

Contrast and stacking need no invention: WCAG thresholds are a published standard, and `stacking_tiers.js` is already Law 10.

**Chromaticity snaps to the nearest palette role only within a hue tolerance** — measured on the LCh hue angle alone, so lightness differences never pull a hue toward the wrong role (§3.3). Below the chroma floor the term is `neutral`; past the tolerance it is `off-palette`, which is itself the drift signal. Silent snapping would launder the exact mistake this system exists to catch.

**Hashing destroys distance, permanently.** `sha256(canonical).slice(0,8)` makes `size=panel` vs `size=region` differ exactly as violently as `panel` vs `glyph`. Do not attempt to encode distance inside the hash — it breaks the format and every existing SCD64 tool. The SCD64 is the fingerprint; per-block ordinal distance travels alongside in BytecodeHealth `context`.

### 3.3 Measurement isolation contract

Several axes are *causally* coupled in the rendered world: shape affects occupancy, size affects occupancy, stacking affects perceived contrast, colour determines contrast, animation perturbs any per-frame sample. Orthogonality is therefore not a property the axes have — it is a property the **decompiler must construct**, by defining each axis from a deliberately isolated source with a deliberately chosen normalization.

The couplings fall into three kinds, and only two of them yield to isolation.

**Source-choice couplings** — resolved by choosing what the axis reads:

| Coupling | Resolution |
|---|---|
| stacking → contrast | read contrast from the computed fg/bg pair, never from screenshot pixels; compositing then cannot reach it |
| motion → density | sample with animations paused at a declared settle point; also required for Law 6 determinism |

**Normalization couplings** — resolved by choosing the denominator:

| Coupling | Resolution |
|---|---|
| shape → density | density is ink ÷ **area inside the clipped region**, not ÷ bounding box. Otherwise rect→circle drops density ~21% (1 − π/4) with no design change whatsoever |
| size → density | density is already a ratio and is scale-invariant. Where it survives — fixed-size content in a growing panel — the density genuinely changed; that is signal, not artifact |

**Mathematical dependence** — isolation cannot help. Contrast *is* a function of colour; no choice of source escapes it. If slot 4 were "which palette entry" and slot 1 "contrast ratio", a palette swap would necessarily move both.

The escape is decomposition, not isolation. The colour space is split along its own orthogonal axes:

- **slot 4 — chromaticity**: the LCh **hue angle** h° = atan2(b\*, a\*), mapped to nearest palette role within a hue tolerance
- **slot 1 — luminance relationship**: WCAG contrast ratio against the resolved background

An isoluminant palette swap moves slot 4 and not slot 1; a tint or shade of the same role moves slot 1 and not slot 4.

**Hue angle, not (a\*, b\*).** Raw a\* and b\* are *not* invariant under lightness change — `#FF0000` is (a\*,b\*) = (80.1, 67.2) while `#800000`, the same hue, is (48.0, 38.1). Keying chromaticity on a\*/b\* would couple slot 4 to every tint and shade, i.e. to slot 1, which is precisely the coupling this decomposition exists to remove. Hue angle is near-stable across that same pair (40.0° vs 38.4°), so it is the component that isolates.

**Chroma floor.** Hue angle is undefined and numerically unstable as chroma approaches zero, so a surface with C\* below the floor quantizes to `neutral` rather than to a noisy hue role. Without the floor, two visually identical greys could land in different palette roles from floating-point noise alone — a spurious drift signal, and a Law 6 determinism violation.

Each axis's decompiler entry declares `{ source, normalization, pausedState }` explicitly. An axis without a declared isolation contract cannot be sealed into a profile.

### 3.4 The orthogonality matrix is a sealed pre-flight

Orthogonality is a property of the *quantizers*, so it is exhaustively testable before the system is trusted rather than merely asserted.

For each ordered pair of evidence axes (A, B) with A ≠ B: apply a controlled mutation to A on a real rendered page and assert B's block is unchanged.

**Thirty directed mutation checks at v1's six live axes; forty-two at seven.** (n × (n−1), not `C(n,2)` — the matrix is directed.)

Direction is not redundant, because the two directions exercise different machinery. *Mutate shape → assert density unchanged* tests whether the density denominator handles clipping. *Mutate density → assert shape unchanged* tests whether the shape quantizer is accidentally reading painted extent rather than border-radius. Different fixtures, different failure modes; neither result implies the other.

The matrix runs **once per `AuthorityProfile` version** and its result seals into the profile. Changing a quantizer therefore forces a re-run rather than silently inheriting an orthogonality claim that was verified against different code.

This gives the redesign trigger a mechanical home: a persistently coupled pair fails the matrix, the profile will not seal, and nothing downstream can be verified until the axes are redesigned. There is no route to explaining a coupled pair away — the failure blocks sealing rather than producing a diagnosable-but-ignorable warning.

## 4. The claim layer

Claims are `Prediction`s evaluated over the measurement vector. They are never coordinates.

### 4.1 Every claim is predicated

Per `types.ts:246`:

> Without one, "holds" degrades to "the observation came back at all" — which is how a claim whose prediction was literally "a bounded cache exists" reported as SUPPORTED against a cache that existed everywhere.

That is precisely this design's failure mode: without predicates, "block 3 matched" degrades to "we computed a block," and the gate reports CONFIRMED against a scene it never measured. `UNFALSIFIABLE_HYPOTHESIS` refuses this — *"a hypothesis with no falsifier is a claim that cannot lose. Not a claim."*

Verdicts use `CausalHypothesisStatus`, which already contains the states needed — notably `underdetermined` for boundary-adjacent values, so no custom dead-zone concept is required. Boundary chatter is otherwise fatal to adoption: an element on a size boundary flips its block on a 1px reflow, the gate fires spuriously twice, and someone disables it.

### 4.2 Salience and primacy are different things

The first draft called slot 0 "authority" and asked it to mean two incompatible things at once. Separating them dissolves most of the open questions:

- **Salience** — visual dominance. A pure function over the evidence vector. Mechanical, measurable, no judgement.
- **Primacy** — "this is the main path." A product-intent claim. Not measurable at any resolution.

Equating them yields bad design law: it demands the primary action always be the loudest element, which forbids a legitimately loud destructive action. A destructive button *should* be able to dominate visually without being the primary path.

The relation between them is therefore a **declared, sealed design law**, not an identity:

> Primacy must sit within the top-N salience ranks.

Still falsifiable — a declared-primary element ranking outside the band is `eliminated` — and no longer wrong about destructive actions.

### 4.3 `AuthorityProfile` — the ranking function must be declared

An undeclared ranking function is interpretation smuggled back into the mechanical layer, i.e. the exact failure this system exists to prevent, hiding in its centrepiece. The profile is explicit, versioned, and sealed.

```ts
type SalienceVector = {
  contrast: number;
  stacking: number;
  area: number;
  paletteSalience: number;
  shapeSalience: number;
  density: number;
  motion: number;
};

type AuthorityProfile = {
  id: string;                       // compact discriminator — 6 hex into slot 0
  digest: string;                   // full authoritative identity (§3.1)
  version: string;
  weights: SalienceVector;          // w₁..w₇
  ordinals: {                       // how each canonical term maps to a scalar
    contrast: Record<string, number>;
    stacking: Record<string, number>;
    // ... one per axis
  };
  tieBreak: readonly (keyof SalienceVector)[];  // deterministic, ordered
  primacyBand: number;              // N in "top-N salience ranks"
  scope: 'global' | 'component' | 'scene';
  liveAxes: readonly (keyof SalienceVector)[];  // motion excluded in v1 (§8)
  isolation: Record<keyof SalienceVector, {      // §3.3 — no contract, no seal
    source: string;
    normalization: string;
    pausedState: string;
  }>;
  orthogonality: {                  // §3.4 — matrix result, sealed with the profile
    matrixDigest: string;
    pairsTested: number;
    passed: boolean;                // false ⇒ profile does not seal
  };
};

function salience(vector: SalienceVector, profile: AuthorityProfile): number;
function rankSalience(scene: SalienceVector[], profile: AuthorityProfile): Rank[];
```

Questions the profile must answer *by containing the answer*, not by leaving it to the reader:

| Question | Answered by |
|---|---|
| Does higher contrast always imply greater salience? | `weights.contrast` sign and magnitude |
| Is an overlay automatically more salient than a button? | `ordinals.stacking` |
| Does density raise or lower salience? | `weights.density` sign |
| How are colour categories ordinally ranked? | `ordinals.paletteSalience` |
| How are ties resolved? | `tieBreak`, ordered and total |
| Global, per-component, or per-scene weights? | `scope` |
| Can a destructive action dominate without being primary? | yes — §4.2, `primacyBand` |

`tieBreak` must induce a **total** order. A partial one reintroduces non-determinism into the verdict and violates VAELRIX Law 6.

### 4.4 Relational and breakpoint-scoped claims

Categorical claims are brittle across viewports: a component may legitimately be `panel` on desktop and `region` on mobile without any drift. Ratio-based quantization softens this but does not solve it.

Because claims live outside the measurement vector, they are free to take forms a coordinate cannot:

```yaml
# breakpoint-scoped
size:
  mobile: region
  tablet: panel
  desktop: panel

# relational — preferred where available
size:
  greater_than: secondary-actions
  less_than: hero-region
```

Relational intent is more durable for responsive UI, and it is closer to how the intent is actually held — "the hero should dominate," never "the hero should be 40% of viewport." A relational claim requires its reference target to resolve in the scene; an unresolvable target is `Clarify`, never a silent pass.

## 5. Architecture

```text
.scdl intent packet  (owner-ratified)
  → SCDL compiler pass pipeline
  → sealed SemanticAct: predicated claims over the measurement vector
                                              │
rendered page (real browser)                  │
  → reverse compilation (computed styles + geometry → measurement vector)
  → BytecodeHealth measurement + observation receipts
                                              │
                                              ▼
              compareSCD64ByBlocks(declared, confirmed) + predicate evaluation
                          mechanical verdict — no agent
                                              │
                                              ▼
                    agent reads eliminated predictions
                    → deposits a Theory about why (non-executable)
```

### 5.1 Intent enters as SCDL

Intent is authored as an SCDL packet and compiled by the existing pass pipeline. `scdl.compiler.js` is a pure pass orchestrator that **never throws** — it always returns `{ ok, packet, errors, diagnostics, regressionSeed }`. The intent dialect adds grammar productions, a `validate.pass` variant, and an `emit-packet.pass` variant emitting a sealed `SemanticAct` instead of a `PixelBrainAssetPacket`. The rest of the pipeline is untouched.

`regressionSeed` (replay token) pairs with `CompilerIdentity { buildId, schemaHash, geneRegistrySnapshot }` — per `types.ts:407`, "replay is unverifiable without it."

Rejected alternative: compiling intent from free natural-language utterances. `types.ts:80` warns that "the compiler must never invent the candidate; if the candidate is not in the utterance, the machine is guessing and attributing the guess to the user." Under-specified prose means the machine fills gaps and stamps the owner's name on them — interpretation drift re-entering through a different door. SCDL is explicit by construction; an under-specified axis emits `Clarify`, never a guess.

### 5.2 Reverse compilation is the comparison mechanism

Rather than seven bespoke comparators, decompile the rendered surface into a measurement vector and compare in packet space with the existing `compareSCD64ByBlocks`. One comparison, reusing the compiler's own vocabulary as the decompiler's target.

> **Load-bearing constraint: the decompiler's input is pixels and computed styles, never the packet.**

Decompile the scene packet or the DOM spec and compile∘decompile is the identity function — it agrees with itself, always, by construction. It *looks* bidirectional while being a single substrate. Fed a real rendered page it is a genuine second derivation; fed the packet it is a mirror.

### 5.3 The agent diagnoses; it never decides

- **Verdict — mechanical.** `compareSCD64ByBlocks` plus predicate evaluation. Pure functions, no discretion.
- **Diagnosis — the agent.** Why block 3 drifted, which derivation is wrong, what the fix is.

Enforced by construction, not convention. `EXECUTABLE_KIND = 'Do'`, and per `types.ts:54` every other kind is "non-executable by construction." Agent output compiles to `Theory` or `Hypothesis`; `trustPartition.ts` and `PERMISSION_WIDENED` prevent it laundering itself into a `Do`.

Specifically forbidden: letting the agent *reconcile* compile-vs-measurement. Reconciliation means choosing which to believe. The two are not permitted to disagree; the agent explains a disagreement, never resolves it.

### 5.4 Authorship partition

Agents may draft intent packets — this is the point of using SCDL, which they already author fluently. But if agents author intent *and* implementation, both sides of the comparison originate from the same interpreter: an agent that misreads the owner writes an intent packet expressing the misreading, implements it faithfully, and the gate goes green on a faithful implementation of a misinterpretation.

Therefore: **agents draft, the owner ratifies.** An agent-authored intent packet compiles to `Hypothesis` — a candidate reading of the owner's intent, non-executable by construction. Owner ratification promotes it to binding.

### 5.5 Receipts

BytecodeHealth is the green-path signal — it fires when a check *passes*. A missing health packet must therefore be a **failure**, never a pass: unmeasured ≠ verified. `observationReceipt.ts` + `REPORT_WITHOUT_RECEIPTS` enforce this mechanically ("report compile without valid receipts cannot claim observation warrant").

BytecodeHealth is also the transport for per-block ordinal distance (§3.2) via its `context` field. It is deterministic by contract — `verifyHealthDeterminism` runs 100× asserting zero checksum drift — and checksummed over stable fields with `timestamp` excluded. `encodeQuantizationFidelityHealth` already has a `{ grade, score, dim }` shape close to what the axes need.

### 5.6 Gate failure behaviour

Today every Compose call site treats gate failure as a reroute: `ComposeEnterPortal.tsx:76`, `ComposeUpdateLedger.tsx:153`, `ComposeReadChrome.tsx:23`, `ComposeGalaxyBackdrop.tsx:40`, `ComposeOracleTerminal.tsx:43` all fall through to legacy markup when `validateComposeScene` returns not-ok. A drifted surface therefore renders silently via the legacy path — which is exactly where drift already lives.

An intent gate inheriting that pattern would change nothing observable. So:

- **Dev / CI: hard fail.** An eliminated prediction fails the run. No fallback render.
- **Production: render, but the act cannot claim confirmation.** The surface ships on the predicted byte with no receipt, and shipping a predicted byte is a violation surfaced by the build, not by the user's session.

Silent reroute is not an option in either mode. If the gate can be satisfied by falling back, it is not a gate.

## 6. What exists vs. what is new

**Reusable, verified present and working:**

| Component | Location |
|---|---|
| Pass-based compiler, never throws | `codex/core/pixelbrain/scdl/scdl.compiler.js` |
| 8-slot generate / parse / block-compare | `src/core/scd64/` |
| Seal, kinds, receipts, predicates, trust partition | `codex/core/semantic-calculus/` |
| Deterministic agent-consumable health channel | `codex/core/diagnostic/BytecodeHealth.js` |
| Stacking tier table (Law 10) | `src/data/stacking_tiers.js` |
| Scene validation + golden fixtures | `src/core/compose/validate/scene.ts`, `tests/qa/features/fixtures/` |
| **Rendered-surface measurement harness** | `tests/visual/*.spec.js` (playwright, real pages) |
| Phenotype gap vocabulary | `PHENOTYPIC-IDEAL-v1` |

The visual-spec harness is the measurement substrate — `viewport-precision-audit.spec.js`, `truesight-element.spec.js`, `glyph-advance-fidelity.spec.js`, `read-layout-regression.spec.js` already drive real rendered pages with `getComputedStyle` / `getBoundingClientRect`.

**Genuinely new:**

1. SCDL intent dialect — grammar productions, validate pass, emit pass to sealed act
2. The decompiler — rendered surface → measurement vector
3. Quantizers — mostly boundary tables; contrast and stacking already written
4. `AuthorityProfile` + salience ranking (§4.3)

**Stub warning.** `src/core/compose/validate/index.ts:296` — `colorContrastRule` is registered in the validation engine, category accessibility, and its `validate` returns `[]` unconditionally behind the comment "This is a placeholder - real contrast checking requires color analysis." It has never checked anything and reports as passing. It is the first thing one would reach for on the contrast axis. **Audit each reused slot for whether it implements or merely resembles its contract before wiring it in.**

## 7. Traps

Each was caught during design; each is a live way to build this wrong. All are the same shape — the same substrate on both sides of a check, or a check that cannot lose.

| # | Trap | Why it cannot fail | Guard |
|---|---|---|---|
| 1 | Encrypt the packet | cipher proves origin, not fidelity | rejected entirely (§1.1) |
| 2 | Derive the measurement from the packet carrying it | comparing a hash to itself | derive B from the rendered page (§2) |
| 3 | Predicate-less claims | "holds" degrades to "the observation returned" | every claim carries a predicate (§4.1) |
| 4 | Agent holds the verdict | it will rationalise a mismatch | kind lattice makes agent output non-executable (§5.3) |
| 5 | Decompile the packet instead of the page | compile∘decompile is the identity | decompiler input is pixels only (§5.2) |
| 6 | Agents author intent *and* implementation | both sides share one interpreter | owner ratification (§5.4) |
| 7 | Absent health packet reads as consent | unmeasured indistinguishable from passing | receipts required (§5.5) |
| 8 | A derived verdict sitting among its own inputs | slot 0 changes "legitimately" for any result | authority left the vector (§3) |
| 9 | Undeclared ranking weights | interpretation returns to the mechanical layer | sealed `AuthorityProfile` (§4.3) |
| 10 | Causal coupling becomes block coupling | a mutation flips two blocks and the second is rationalised as "expected" | isolation contract (§3.3) + matrix blocks sealing (§3.4) |
| 11 | Compact slot-0 id treated as the profile's identity | a 24-bit collision makes two profiles read as one, silently | full digest in health context + receipt + registry, must agree (§3.1) |

Trap 8 is worth stating in its own right, because the *first correction proposed for it was itself a trap*: amending criterion 3 to "slot 0 may also change when the mutation crosses a ranking boundary" would let any unexpected slot-0 change be attributed to a boundary crossing. The criterion would stop being able to lose. Removing authority from the vector fixes the contradiction without weakening the falsifier.

## 8. Motion is the weak axis

**Motion is out of scope for the first implementation.** Slot 7 is reserved and its terms are fixed, but the axis emits `Clarify` until a headed sampling harness exists. The seven-evidence-axis model in §3 describes the complete design; in v1, salience is computed over the remaining six (contrast, stacking, size, colour, shape, density), and the `AuthorityProfile` records which axes were live so historical verdicts stay interpretable.

If the packet authors the animation and the gate reads that animation back out of computed style, it compares authored to authored — it would catch a renderer ignoring the packet, but never catch the owner being misinterpreted. Real measurement means sampling rendered frames. Headless software-rasterises and lies about motion (portal read: 17.7fps headless vs 74.4 headed, same commit), so motion measurement runs headed (`DISPLAY=:0`) or not at all. Never report a motion verdict from a headless run.

## 9. Success criteria

1. An intent packet whose declared primacy is contradicted by the rendered surface produces an `eliminated` prediction naming the failing claim — **demonstrated on a real page, not a fixture.**
2. A surface never measured is mechanically distinguishable from one measured and passing (predicted vs. confirmed byte; missing receipt fails).
3. **Mutating one evidence axis in a rendered surface flips exactly its corresponding block among slots 1–7, and no other.** Slot 0 is unaffected — it carries profile identity, not measurement.
4. A salience *rank* change caused by that mutation is asserted separately, as a claim-layer verdict, never as a coordinate change.
5. **The orthogonality matrix passes for every directed pair of live axes** — 30 checks at v1's six axes, 42 at seven — on real rendered pages, before any profile seals.
6. Every live axis has a declared `isolation` contract; an axis without one cannot be sealed into a profile.
7. `compareSCD64ByBlocks` output plus BytecodeHealth `context` locates drift to an axis *and* an ordinal distance.
8. Changing any `AuthorityProfile` weight or quantizer changes the slot-0 profile id, forces a matrix re-run, and leaves historical verdicts computed under the old profile identifiable.
9. The compact slot-0 id agrees with the full profile digest in `BytecodeHealth.context`, the observation receipt, and the profile registry. Disagreement fails the act — a 24-bit collision must never make two profiles read as one.
10. `tieBreak` induces a total order — no two distinct surfaces tie unresolvably (Law 6).
11. No agent output can reach `Do` without owner ratification.
12. The gate survives a week of ordinary development without being disabled — zero spurious failures from boundary chatter.

Criteria 3 and 5 are the ones that falsify the design: if the evidence axes are not orthogonal, block mismatches will not localise and the coordinate system is decorative. They are stated in their strong, losable form deliberately — a persistently coupled pair must force a redesign of the axes, never an amendment to the criterion. The failure blocks profile sealing precisely so that "explain it away" is not reachable.
