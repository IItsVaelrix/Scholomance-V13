# Changelog

## 2.2.0

No packet-format change. Closes the last defect from the external audit and
institutionalizes it, plus a defect found in the 2.1.0 drift guard itself.

### Fixed

- **Enum fields reject instead of crashing.** A non-scalar or wrong-typed value in
  any of the ten enum fields raised `TypeError: unhashable type` rather than
  returning an error list. `_enum_member()` now gates membership on
  `isinstance(value, str)`. Verified by fuzzing **265 hostile mutations across all
  53 field paths** of the seed packet with array, object, integer, null, and
  boolean values: **zero crashes**, every case rejected by the field that owns it.
- **A ledger scan continues past a malformed packet.** `validate_chain` aborted on
  the first crafted packet, so one bad entry blocked validation of every other
  packet in the ledger — the resume path. Now `chain([poison, invalid])` reports
  errors for both indices. Confirmed against a control: the downstream packet
  alone produces 6 errors, and all 6 still appear when it follows the poison one.
- **`packet-schema.json` agrees.** Checked mechanically over five enum fields x
  five hostile types; the schema rejects every one, so this closed with no drift.

### Added

- **A `Type safety` row** in SKILL.md's enforcement table and in
  `references/evals.md`, bound in the drift guard to the two tests that prove it.

### Fixed — in the 2.1.0 drift guard itself

- **Per-test instrumentation, not per-row.** The enforcement-table guard required
  *a row* to observe a rejection. A row binding several tests therefore let a
  gutted test body hide behind a sibling that still exercised the validator — the
  masking pattern the guard exists to catch, inside the guard. Found by mutation:
  gutting `test_enum_fields_reject_non_scalars_without_crashing` left the suite
  green. Each bound test must now touch the packet layer on its own.

Mutation battery, 6/6 killed: revert the isinstance guard, make the guard return
`True`, truncate the ledger scan, delete the SKILL.md row, gut either bound test.

## 2.1.1

### Fixed

- `--require-signature` now fails closed when no verification key is available;
  the presence of an unverified signature is no longer admission.
- Packet HMACs now use a domain-separated payload containing the schema,
  algorithm, `key_id`, and content digest, so signer provenance cannot be
  relabeled without invalidating the MAC.
- A requested mutation may no longer declare `READ_ONLY`, episodic memory may
  no longer use `PROMOTE`, and `CONTESTED` may no longer rely on an arbitrary
  parent id in place of two decisive contradicted lineages.
- All ten enum fields now treat arrays and objects as ordinary validation
  failures rather than attempting hash-set membership. `validate_chain` reports
  the malformed packet and continues scanning later ledger entries.
- The machine-readable admission command also guards malformed `integrity`,
  `evidence`, signature `key_id`, and `parent_ids` shapes, preserving a rejection
  receipt and continued ledger scanning instead of surfacing Python exceptions.
- The Bytecode XP persistence seam now invokes the Python validator itself via
  the machine-readable `admit` command. Callers cannot inject an always-accept
  verdict function or provide a key alongside each packet. A verified-signature
  receipt is required before cognitive-packet provenance can enter QBIT memory.
- Detached `diagnostic.verified` booleans are no longer accepted. XP must name an
  outcome inside a checksum-verified DiagnosticReport whose checksum also has a
  deployment-key HMAC attestation (`BYTECODE_DIAGNOSTIC_KEY`). The HMAC covers
  the full 256-bit canonical report digest, not its abbreviated display checksum.
- The cross-language integration test signs a forged packet as a bus participant
  and proves the JavaScript persistence seam refuses it.
- The Python admission receipt now distinguishes claimed evidence from decisive
  evidence and emits decisive evidence IDs, decisive lineage IDs, and the
  validator-computed lineage count. QBIT provenance labels `declaredBasis`
  explicitly and persists both claimed and decisive summaries; JavaScript does
  not recompute decisiveness.
- The JavaScript receipt boundary requires sorted unique summaries, decisive
  subsets of their claimed sets, a matching decisive count, and a non-empty
  signer key ID before provenance can be sealed.

## 2.1.0

No packet-format change; v2 packets and ledgers validate unchanged. This release
closes the gaps an audit of v2 found: a guard that reported green by not running,
a third hand-maintained copy of the rules with nothing checking it, and a skill
body that documented what the tooling does not enforce while staying silent about
what the protocol was measured to be worth.

### Fixed

- **The schema/validator drift check no longer skips.** It was gated on an
  optional `jsonschema` install and, on a machine without one, reported green by
  not running -- while being the guard for the exact defect that broke v1. The
  schema half is now evaluated by a bundled `tests/minischema.py`, a
  dependency-free evaluator for the JSON Schema subset `packet-schema.json`
  actually uses. `SchemaEvaluatorFidelity` still cross-checks it against the real
  library wherever one is installed, and `MiniSchemaSemantics` checks the
  evaluator's own semantics keyword by keyword where one is not. If the schema
  grows a keyword the evaluator does not implement, the suite fails rather than
  ignoring the new rule.
- **Every hex constraint is pinned by manifest.** Mutation testing found that
  relaxing the hex `pattern` on `evidence[].digest_sha256` into a length check --
  the v1 defect, reintroduced -- survived the whole suite, because the
  hand-written schema cases only covered the fields someone had thought of. That
  is the masked-rule failure again, one layer up. `pattern_manifest()` enumerates
  every pattern constraint in the schema and the test pins the full set, so
  loosening any of the seven fails and adding a constrained field has to be a
  deliberate manifest edit. All seven mutants are now killed.

### Added

- **A drift guard on SKILL.md's enforcement table.** That table is a third copy
  of the rules alongside the validator and the schema, and nothing checked it --
  which is how v1 broke, one copy looser than the other. Each row is now bound to
  the tests that prove it, checked in both directions, and the binding is not
  name-only: each row is executed with the packet layer instrumented, so a row
  must actually call into it and -- for every row claiming a rejection -- at
  least one bound test must see the validator refuse something. Verified against
  six mutations: inventing a row, deleting a row, renaming a bound test, gutting
  a bound test body, gutting a determinism test, and weakening the authority rule
  in the validator. All six fail the suite.
- **Four rows in `references/evals.md`** for the above: constraint erosion,
  schema evaluator, documentation drift, and the drift row's `needs jsonschema`
  qualifier removed.

### Documentation

- **SKILL.md now states what the protocol was measured to do.** v2 was careful
  about what the tooling does not enforce and silent about what the protocol did
  not buy. The preregistered behavioral arms tied three ways -- no skill, told to
  discuss, and the full protocol all scored 25/25 on the traps and 5/5 on the
  over-abstention control -- at 1.86x tokens, 6x tool calls, and 4x wall time.
  Both real positives are robustness rather than accuracy: the protocol does not
  make agents timid, and it produced zero false positives on eight artifacts
  written by agents who had never seen the validator.
- **The trigger gates on stakes, not on agent count.** The old description fired
  on "two or more agents," which is precisely the condition measured as pure
  overhead. It now asks what turns on the answer being right, and carries the
  cost number so the reader sees the price at the point of decision.
- **A collapse table for the workflow.** Eight steps at 6x tool calls needs an
  explicit cheap path: which steps may be collapsed on a small task, which never
  may, and why. Freeze-the-contract, adjudicate, synthesize, and stage-memory do
  not collapse; the rest do.
- **Wired versus declared.** Only SCD64 reaches the packet layer. The other six
  named components are interface seams this skill does not call, so protocol.md's
  deterministic fallback is what actually runs unless a deployment wires them in.
  Said plainly instead of implied.
- **The `REVERSIBLE` authority gap is stated in SKILL.md**, not only in this
  changelog, where a reader comparing the enforcement table against the rule had
  to infer it.
- The 2.0.0 entry below says "21 rows enforced." The shipped suite reported 24 of
  29; the count was stale on arrival. The runner prints the live number, which is
  the one to trust.

## 2.0.0

Breaking: the packet wire format moves to `cognitive-bus.packet.v2`. v1 packets do
not validate. Re-seal them after applying the two shape changes below; content
hashes and packet ids change as a result, so a v1 ledger must be re-sealed as a
unit or kept archived under its old validator.

### Why it broke

v1 declared seventeen Required Invariants in `references/evals.md` and mechanically
enforced three of them. The rest were prose the model had to police itself with,
which is the failure mode the protocol exists to prevent. Measured against v1's own
eval table, the bundled validator accepted:

- a query hash sitting in an SCD64 field — the adversarial fixture v1 explicitly
  required to be rejected;
- a static fingerprint copied verbatim into `scd64_confirmed_runtime`;
- `CONFIRMED` on a `MODEL_ONLY` basis with an empty evidence array;
- three evidence items sharing one `independence_key`, counted as corroboration;
- a model's own output, self-marked `VERIFIED`, promoting a status;
- promotion straight to semantic memory from a model-only claim.

### Changed

- **SCD64 fields carry provenance.** `scd64_predicted_static` and
  `scd64_confirmed_runtime` are now `null` or `{fingerprint, provenance}` with a
  hex-constrained fingerprint and a field-specific provenance tag. A bare
  64-character string no longer occupies an SCD64 slot. This closes the silent
  path; a caller who writes the wrong tag deliberately is making a declared false
  statement in a named field, which is the limit of what a structural validator
  can do here.
- **The integrity block separates content addressing from tamper evidence.**
  `integrity` is now `{algorithm, content_sha256, signature}`. `content_sha256`
  gives content addressing and catches corruption; anyone can recompute it, so it
  was never tamper detection and is no longer described as such. `signature` is an
  optional HMAC-SHA256 over the content hash. `seal --key-file`/`CBUS_PACKET_KEY`
  signs, `validate --key-file` verifies, `validate --require-signature` refuses
  unsigned packets.

### Added

- **Cross-field enforcement.** `SUPPORTED`/`REFUTED` require at least one decisive
  evidence item; `CONFIRMED` requires decisive `EXECUTION` evidence or two distinct
  `independence_key` lineages; `REFUTED` must cite the packet it refutes;
  `CONTESTED` needs a contested parent or two disagreeing lineages; an `ABSTAIN`
  packet cannot claim support; promotion to semantic or procedural memory requires
  an externally grounded basis; a memory operation and its stratum must agree; a
  packet requesting no mutation must declare `READ_ONLY` risk.
- **Lineage arithmetic.** `corroboration()` counts distinct `independence_key`
  values among decisive evidence. `MODEL_OUTPUT` and `MEMORY` are never decisive
  and never count as lineages.
- **`chain` subcommand.** Validates a ledger array: parents resolve within the
  ledger, logical clocks advance along parent edges, ids are unique, task_id is
  consistent. This is what makes the crash-resume invariant checkable.
- **`tests/test_invariants.py`.** The eval table, executable, one test per row,
  each named after its row. 21 rows enforced. Four rows — sycophancy resistance,
  abstention reward, lost-middle retrieval, bounded convergence — are declared
  `skipTest` with the harness they need, because the packet layer cannot decide
  them and faking a pass would be worse than admitting it.
- **Schema drift guard.** Cross-checks `packet-schema.json` against the Python
  validator over a fixture battery. v1 drifted: the schema required hex for
  evidence digests but allowed any 64 characters in the SCD64 fields. Runs only
  where `jsonschema` is installed; it is not a dependency of the skill.
- **`references/fixtures/ledger.json`.** A three-packet seed/verify/snapshot chain.
- Conditional (`allOf`) rules in `packet-schema.json` for the cross-field
  constraints JSON Schema can express, with a `$comment` naming the ones it cannot
  so nobody mistakes schema validation for admission.

### Not changed, deliberately

- `REVERSIBLE` mutations still do not require an `authorization_ref`. Only
  `MATERIAL` and `DESTRUCTIVE` do, which is what the skill body says. Tightening
  this changes protocol semantics and is a decision for the deployment, not a bug
  fix.

### Test-suite efficacy

Mutation tested: 26 mechanical weakenings of the enforcement logic applied one at
a time (drop the evidence-kind check, count evidence items instead of lineages,
make `--require-signature` a no-op, let logical clocks run backwards, and so on).
The first run killed 22/26. The four survivors were rules that some *other* check
happened to fire on first in every existing case, so nothing tested them alone:

- the grounded-basis requirement, always masked by the evidence-count rule;
- the promotion status gate, always masked by the promotion basis gate;
- the hex constraint on fingerprints and digests -- the existing tests used
  `"a" * 64` and `"b" * 64`, which are valid hex, so replacing the charset check
  with a length check changed nothing. This is the v1 defect class exactly;
- the `packet_id` check, always masked by the digest check.

Four tests were added to isolate each. The suite now kills 26/26.

A 100% mutation score measures coverage of the rules that exist. It cannot detect
a rule that was never written, and the mutant set was authored by the same party
as the fix. Treat it as evidence the suite has teeth, not as evidence the
enforcement is complete.

### Documentation

- The `description` frontmatter states triggering conditions only. It previously
  summarized the workflow, which invites a reader to follow the summary instead of
  the body.
- SKILL.md gains a table of what the tooling enforces and an explicit statement of
  what it does not, including that a green test run is not evidence the protocol
  works.
