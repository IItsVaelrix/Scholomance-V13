# Concept Chemistry Hardening Design

**Date:** 2026-08-01
**Target:** `codex/core/pixelbrain/concept-chemistry.js`
**Contract:** `PB-CONCEPT-CHEM-v1`
**Classification:** Behavioral hardening and data-integrity repair
**Collab task:** `7feb4564-031b-4d87-ab3e-faa648ab5cbd`

## 1. Objective

Repair the verified Concept Chemistry defects without pretending that lexical
distance is semantic complementarity. Preserve the calibrated feasibility
weights and stability thresholds, make every emitted result deterministic and
content-addressed, reduce avoidable diagnostic cost in hot-path consumers, and
state the limits of the surface-evidence channels precisely.

The implementation remains a deterministic information-retrieval heuristic. It
does not become a thermodynamic simulator or a general semantic reasoner.

## 2. Audit Verdict

| Finding | Verdict | Design response |
|---|---|---|
| Similarity versus complementarity | Partly accurate model limitation | Keep the calibrated surface-bond term, name it accurately in code/docs, and reject `1 - similarity` or semantic distance as false complementarity. Relational complementarity remains future work requiring labeled evidence. |
| 512-dimensional hashing and cross-word n-grams | Accurate | Extract n-grams per normalized word, raise `DIM` to 4096, and use sparse internal feature maps in scoring so the larger space does not create dense hot-path allocation. |
| Law Gate tokenization, negation, and scope | Accurate | Add compound-aware normalization, prevention/negation handling, and actor-before-action-target predicates scoped to clauses. |
| Mutable Law Sets | Inaccurate as an external bypass | Keep law vocabulary module-private. Do not use `Object.freeze(Set)` because freezing a Set does not freeze its entries. Store rule definitions in recursively frozen arrays/objects. |
| Emergent product coherence | Accurate model limitation | Retain `coherence` as a calibrated surface-evidence channel and document it as such. Do not replace it with an uncalibrated semantic heuristic. A future contract may accept corpus/registry relationship evidence. |
| Checksum ordering | Accurate and critical | Hash the complete recursively canonical result after all selected fields are attached, excluding only `checksum`; then recursively freeze the result. |
| Private grounding seam | Accurate | Import and call a public grounding evidence function. Preserve `prepareForSynthesize()` as a compatibility adapter, but Concept Chemistry no longer reads `_groundingFns`. |
| Diagnostic overhead | Accurate | Add `includeDiagnostics` with a backward-compatible default of `true`; core hot-path consumers that do not read the fields pass `false`. |
| Negative feasibility | Accurate | Clamp the law-scaled raw score to `[0, 1]` before rounding and classification. |

## 3. Evidence Baseline

The pre-change audit established:

- `lawGate('non-deterministic pipeline')` returned `LAW_ALIGNED`.
- Negated/preventive descriptions containing `random` or `stochastic` were
  rejected.
- `lawGate('client dashboard for generating reports')` returned
  `LAW_VIOLATION:CONSUMER_COMPUTES`.
- `cat dog` emitted cross-boundary features such as `atd` and `tdo`.
- Moderate phrases produced 22 to 26 occupied-bucket collisions from roughly
  155 feature occurrences at `DIM = 512`.
- Repeated-call benchmark averages were approximately 3.16 ms for semantic
  diagnostics and 5.12 ms for complete synthesis.
- `banana + renderer -> x` produced feasibility `-0.0175`.
- 118 relevant tests passed before changes.

These measurements are diagnostic evidence, not permanent timing thresholds.

## 4. Architecture

### 4.1 Feature extraction

Introduce one internal feature extractor that returns weighted feature keys for
normalized words:

1. Normalize case and split hyphens/underscores into words.
2. Emit one token feature per word at weight `2.0`.
3. Pad each word independently (`#word#`).
4. Emit 3-grams and 4-grams only inside that padded word.
5. Hash features into 4096 signed buckets.

`conceptVector(text)` continues to return a dense `DIM`-length number array for
API compatibility. `bondEnergy(a, b)` uses sparse bucket maps internally and
must be numerically equivalent to cosine over the dense vectors. This keeps the
public vector contract while avoiding four large dense allocations per
synthesis call.

The vector dimension change is an algorithm correction inside
`PB-CONCEPT-CHEM-v1`; result checksums necessarily change because the prior
results were not complete content identities. Historical ledger checksums stay
as historical observations and are not rewritten. Every new result carries
`algorithmVersion: '2.0.0'` and
`vectorVersion: 'fh-word-ngram-v2-d4096'`, and both fields participate in the
checksum so a future scoring change cannot masquerade as the same algorithm.

### 4.2 Law Gate

The Law Gate remains a narrow deterministic rule engine, not a general natural
language parser.

It uses two stages:

- Vocabulary violations: normalize `non-deterministic` and spaced variants to
  the canonical forbidden concept `nondeterministic`. Ignore a forbidden term
  when it is governed by a bounded prevention marker such as `prevent`,
  `avoid`, `reject`, `prohibit`, `without`, or the `anti-` prefix. Do not treat
  the `non-` in `non-deterministic` as prevention.
- Actor/action violations: split text into clauses, require the consumer actor
  to precede the forbidden action by at most eight tokens in the same clause,
  and require broad verbs such as `compute`, `derive`, `generate`, or `issue`
  to bind within eight following tokens to a protected authoritative target.
  Clauses split on sentence punctuation, semicolons, colons, or newlines—not
  on `and`, because one violation may contain a coordinated action. Protected
  targets are `hash`, `checksum`, `digest`, `seal`, `receipt`, `identity`, and
  authoritative `field`, `projection`, `color`, `energy`, or `parameter`
  terms. Intrinsically specific verbs `hash`, `rehash`, `recompute`, and
  `mint` remain violations without a separate generic target.

Prevention governs a forbidden vocabulary hit only when a prevention marker is
within the preceding three tokens or is joined by a hyphen as a prefix/suffix.
The prevention vocabulary is `anti`, `avoid`, `block`, `eliminate`, `never`,
`no`, `prevent`, `prohibit`, `reject`, and `without`, including ordinary
inflections. This is deliberately bounded so a prevention statement in one
clause cannot excuse a later affirmative violation.

Required outcomes include:

- `non-deterministic pipeline` -> violation.
- `anti-stochastic scheduler` -> not a stochastic violation.
- `prevents random output with deterministic seeds` -> aligned.
- `client dashboard for generating reports` -> not a consumer-computation
  violation.
- `producer generates reports for the client` -> not a consumer-computation
  violation.
- Existing consumer-hash/checksum/receipt violations remain blocked.

Rule definitions are recursively frozen plain data. No mutable rule collection
is exported.

### 4.3 Grounding boundary

`grounding-index.js` exports:

```js
getGroundingEvidence(index, conceptA, conceptB)
```

It returns:

```js
{
  grounding: number,
  attestA: number,
  attestB: number,
  coOcc: number,
  coOccurrenceScoring: false,
  details: object,
  corpusPMI: object | null,
}
```

This combines the existing attestation composite, co-occurrence diagnostic,
and optional signed PMI diagnostic behind one public boundary. `synthesize()`
calls this function directly and never reads `_groundingFns`.

`prepareForSynthesize(index)` remains exported for callers already using it. It
returns a frozen compatible index and is documented as no longer required by
new callers. Removing it is outside this change.

### 4.4 Diagnostics

`synthesize()` accepts:

```js
includeDiagnostics?: boolean // default true
```

When true, the existing phonotopographic and semantotopographic fields are
computed and emitted. When false, those fields are absent. The checksum covers
exactly the fields emitted in either mode.

`build-gate.js` and `simulate-reaction.js` pass `includeDiagnostics: false`
because they do not consume those fields. Calibration and direct callers retain
the current default behavior.

### 4.5 Canonical identity and immutability

Create a Concept Chemistry canonical serializer with these rules:

- recursively sort object keys;
- retain array order;
- serialize finite numbers, strings, booleans, and null;
- reject undefined, non-finite, cyclic, Map, Set, and typed-array values;
- normalize negative zero to zero.

The checksum is:

```text
synth1:<first 16 lowercase hex characters of SHA-256(canonical result without checksum)>
```

All fields, including optional corpus, phonetic, and semantic diagnostics, are
attached before hashing. The completed result is recursively frozen so nested
arrays and diagnostic objects cannot mutate after identity is assigned.

### 4.6 Numerical bounds

The existing formula remains:

```text
raw = 0.15 * bond + 0.65 * grounding + 0.20 * coherence
feasibility = clamp(raw * law.scale, 0, 1)
```

Clamping occurs before rounding and `stabilityClass()`. Law violations return
positive zero exactly.

## 5. Schema Contract

Register the existing `PB-CONCEPT-CHEM-v1` input/result shape in
`SCHEMA_CONTRACT.md`, including optional diagnostic and corpus fields and the
new optional `includeDiagnostics` input. Register the additive
`algorithmVersion` and `vectorVersion` identity fields as required result
fields. This documents an existing runtime contract plus backward-compatible
additions; it does not invent a second parallel schema.

No field is renamed or removed. `bond` and `coherence` remain for compatibility
and are documented as surface-form evidence rather than proof of semantic
complementarity.

## 6. Error Handling

Public invalid-data failures introduced by canonicalization use the existing
`PB-ERR-v1` VALUE, RANGE, or STATE categories. Normal synthesis with ordinary
string/number inputs does not gain new failure modes. Existing coercion of
reactant/product strings remains deterministic.

Explicit grounding values are clamped to `[0, 1]` before aggregation so caller
mistakes cannot escape the feasibility contract. Non-finite grounding values
are rejected with a `PB-ERR-v1-RANGE` error rather than silently serialized.

## 7. Test Strategy

Follow red-green-refactor in independently reviewable slices:

1. Feature tests fail on the old 512 dimension and cross-word overlap, then
   verify dense/sparse bond equivalence.
2. Law tests fail for the reproduced false positive/negative cases while
   preserving every existing true-positive rule.
3. Grounding tests fail when a plain index lacks `_groundingFns`, then pass via
   the public evidence function.
4. Checksum tests independently recompute the canonical checksum, prove that a
   diagnostic-field change changes identity, and verify recursive freezing.
5. Diagnostic-mode tests prove omitted diagnostics do not affect feasibility.
6. Range tests reproduce negative feasibility and assert `[0, 1]` bounds.
7. Existing calibration tests verify the known-positive classification and
   control ordering remain valid. If the word-boundary/dimension correction
   changes exact scores, recorded historical scores are not rewritten; live
   invariants remain the gate.

New critical assertions use the repository bytecode assertion helpers where
their API fits. Tests continue using real implementations rather than mocks.

## 8. Validation

Minimum completion evidence:

- targeted Concept Chemistry, grounding, calibration, build-gate, and
  simulation tests pass;
- the complete PixelBrain test subtree passes;
- lint passes for all touched source/test files;
- typecheck is run and any pre-existing known failure is distinguished from a
  new failure;
- deterministic replay produces one result and one checksum per input/mode;
- a post-change benchmark records diagnostics-on versus diagnostics-off cost;
- security/schema verification relevant to the changed input/result contract
  passes.

## 9. Documentation and Delivery

- Add the schema notice and contract to `SCHEMA_CONTRACT.md`.
- Update comments in Concept Chemistry and Grounding Index to match actual
  semantics.
- Write `docs/scholomance-encyclopedia/post-implementation-reports/PIR-20260801-CONCEPT-CHEMISTRY-HARDENING.md` with exact validation evidence.
- Do not edit the user's existing changes in
  `codex/core/pixelbrain/calibration/concept-chem-ledger.js`.

## 10. Deferred Work

A true complementarity/coherence scorer requires explicit relational evidence:
corpus co-occurrence calibrated on labeled reactions, a machine-readable
semantic correspondence registry, or another deterministic relation graph.
Neither cosine distance nor the current semantic-topography similarity is an
acceptable substitute. That work requires its own versioned design and
calibration corpus and is intentionally outside this repair.
