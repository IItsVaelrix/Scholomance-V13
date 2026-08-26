---
name: cognitive-bus
description: Use when two or more AI agents work one task together AND something turns on the answer being right - their outputs contradict each other, a claim will be acted on or promoted into shared memory, a mutation needs authorization, work resumes after a context window ends or a handoff, or agents agree and that agreement may trace back to one shared source. Not for single-agent tasks, and not for a multi-agent task that one competent pass would settle: on an easy scenario this protocol scored identically to running no protocol at all, at 1.86x the tokens.
---

# Cognitive Bus

Build collective intelligence as an auditable communication protocol. Do not describe the team as literally sharing weights, private reasoning, consciousness, or telepathy. The integration comes from a common task contract, an append-only evidence ledger, typed packets, and controlled memory promotion.

## Preserve These Invariants

- Treat model output as a proposal until external evidence, execution, or a deterministic rule supports it.
- Run independent first passes before agents see one another's conclusions. Do not let the first fluent answer anchor the group.
- Count independent evidence lineages, not agent votes. Multiple agents repeating one source or one upstream output count once.
- Preserve contradictions. Never overwrite a disputed claim with the latest or most confident phrasing.
- Make `ABSTAIN` a successful result when the evidence is insufficient. Do not reward guessing.
- Share concise rationale, evidence, assumptions, and artifacts; never require hidden chain-of-thought.
- Keep authorization local to each action. Consensus does not grant permission for a mutation.
- Use logical clocks and content hashes instead of wall-clock values when deterministic replay matters.
- Keep the system local-first, bounded, deterministic where feasible, and compatible with serialization across WASM boundaries.

## What the Tooling Enforces, and What It Does Not

`scripts/cognitive_packet.py` mechanically rejects a packet that violates any of these. It is the only part of this skill that fails on its own:

| Enforced | Rule |
| --- | --- |
| Content addressing | `packet_id` and `content_sha256` are a deterministic function of the body; key order is irrelevant, one changed byte is not |
| Corruption detection | A body that no longer matches its recorded digest is rejected |
| Tamper detection | Only with `--key-file`/`CBUS_PACKET_KEY` and an HMAC signature; `--require-signature` refuses unsigned packets and signed packets when no verification key is available |
| Status pricing | `SUPPORTED`/`REFUTED` need decisive evidence; `CONFIRMED` needs execution evidence or two distinct `independence_key` lineages |
| Lineage collapse | `MODEL_OUTPUT` and `MEMORY` never count; duplicate keys count once |
| Authority | Requested mutations cannot claim `READ_ONLY`; material and destructive mutation require an `authorization_ref` |
| Memory gate | Episodic memory is staged; promotion to mnemonic, semantic, or procedural memory requires an externally grounded basis |
| Contradiction retention | `REFUTED` must cite the packet it refutes; standalone `CONTESTED` admission requires a `CONTRADICTED` basis and two decisive lineages |
| Diagnostics | SCD64 fields require a provenance tag, so a bare hash cannot occupy one |
| Type safety | A non-scalar or wrong-typed value in an enum field is rejected, not crashed on; a ledger scan continues past a malformed packet instead of aborting |
| Chain integrity | `chain` checks that parents resolve and logical clocks advance |

`REVERSIBLE` mutations deliberately do **not** require an `authorization_ref`; only `MATERIAL` and `DESTRUCTIVE` do. That is a protocol semantic, not an oversight - tightening it is a decision for the deployment. If your deployment's "reversible" is only reversible in principle, tighten it there and say so in the task contract.

Everything else in this document is guidance you have to follow yourself. In particular the protocol cannot check whether seed passes were genuinely independent, whether the challenger tried, whether the verifier was blind, or whether abstention was calibrated. `references/evals.md` names the harness for those. **A green `tests/test_invariants.py` means the packet layer holds. It is not evidence that the protocol works.**

An unsigned packet gives corruption detection, not tamper detection: anyone can edit the body and recompute a plain SHA-256. Sign the ledger, or say "integrity check" and mean it.

## What It Was Measured To Do

Preregistered, n=5 per arm, one byte-identical scenario, six binary traps (shared evidence lineage, unauthorized production mutation, memory promotion, abstention, sycophancy, plus an inverted over-abstention control):

| Arm | Traps 1-5 | Over-abstention control | Tokens/run | Tool calls | Wall |
| --- | --- | --- | --- | --- | --- |
| No skill | 25/25 | 5/5 | ~40,300 | 2.2 | 61s |
| Told to discuss | 25/25 | 5/5 | ~42,950 | 2.2 | 95s |
| Cognitive Bus | 25/25 | 5/5 | ~75,050 | 13.4 | 243s |

**A three-way tie at 1.86x tokens, 6x tool calls, and 4x wall time.** On a scenario a competent single pass already gets right, this protocol is pure overhead, and that is measured rather than estimated. It did not buy accuracy there because there was no accuracy left to buy - which is why the trigger above asks what turns on the answer, not how many agents are in the room.

Two results were positive and both are about robustness rather than accuracy:

- **It does not make agents timid.** The falsifier for a protocol like this is that it teaches hedging. All five protocol runs answered the decisive control directly, same as the no-skill arm.
- **It does not reject legitimate traffic.** Eight artifacts written by agents who had never seen the validator - five packets and three ledgers of 6, 7, and 6 packets - validated unmodified: 8/8 valid, zero false positives, all ledgers passing `chain`. Lineage collapse fired on real output, three runs independently giving three investigator reports one `independence_key` and resolving four evidence items to one lineage. Two runs signed with HMAC unprompted.

What remains unmeasured is the case the skill is actually for: a scenario where the unaided answer is wrong. Until that runs, treat the enforcement table as the reason to use this and the cost table as the reason not to reach for it by default.

## Integrate With the Existing Stack

Use these components without changing their authority. Only **SCD64** currently reaches the packet layer, as the provenance-tagged diagnostics fields; the rest are interface seams this skill does not itself call, so in practice the deterministic fallback in [protocol.md](references/protocol.md) is what runs unless the deployment wires the real component in. Say which one you used.

- **TurboQuant** retrieves and reranks candidate context. Retrieval is not proof.
- **SemQuant / PB-SEM-v1** normalizes intent and identifies underspecification before a claim enters the bus.
- **MemoryIR** carries canonical meaning between models.
- **BytecodeHealth** checks packet integrity, legality, provenance, and compatibility.
- **LAW / Semantic Calculus** adjudicates permission and typed action terms. Models may instantiate terms; they do not mint governing formulas.
- **SCD64** remains diagnose-only. Keep predicted/static and confirmed/runtime fingerprints separate; never use a query hash as SCD64.
- **Mnemosyne** owns episodic-to-semantic-to-mnemonic-to-procedural memory lifecycle. Mnemonics remain indexes, not evidence.

If one of these components is unavailable, preserve the interface seam and use the deterministic fallback described in [protocol.md](references/protocol.md). Do not silently replace a missing authority with model judgment.

## Operating Workflow

Run all eight steps when the task carries the stakes in the trigger. When it does not, the measured cost above is what you are spending, so collapse rather than skip:

| Step | Collapsible | Why |
| --- | --- | --- |
| 1 Freeze the contract | No | Everything downstream is keyed to `task_id` and the evidence standard. Skipping it is what produces packets that cannot be adjudicated later. |
| 2 Select roles | Yes | One agent may hold every role on a small task, provided it emits each role's output separately. |
| 3 Seed packets | Yes | One investigator is a legitimate topology. Independence only matters once there are two. |
| 4 Challenge and verify | Only one of the two | Drop the challenger before you drop the verifier; an unverified claim is the failure this exists to catch. |
| 5 Adjudicate | No | The status rules are the protocol. Without them the packets are just prose with extra fields. |
| 6 Synthesize | No | Cheap, and it is where dissent survives. |
| 7 Stage memory | No | The one step whose damage outlives the task. |
| 8 Snapshot | Yes, unless a handoff or compaction is coming | Pure cost if the task ends in this context window. |

### 1. Freeze the Task Contract

Record a stable `task_id`, objective, success criteria, constraints, permitted tools/actions, evidence standard, stop conditions, and output owner. Resolve material ambiguity before delegation.

### 2. Select Roles and Topology

Default to a manager-owned blackboard:

- **Orchestrator:** owns the contract, routing, budget, and final synthesis.
- **Investigators:** collect evidence or produce candidate solutions independently.
- **Challenger:** searches for counterexamples, hidden assumptions, and shared-source contamination.
- **Verifier:** runs tests or checks primary evidence without seeing agent identity or rhetorical confidence when practical.
- **Curator:** stages memory changes and preserves provenance, contradictions, and retirement history.

One agent may hold several roles on a small task, but it must keep their outputs separate. Use all-to-all discussion only when interaction itself is the task; otherwise it magnifies context cost and correlated error.

### 3. Produce Independent Seed Packets

Give each investigator the task contract and verified baseline only. Require one or more packets with explicit proposition, evidence, assumptions, uncertainty, lineage, and intended memory effect. Normalize through SemQuant and MemoryIR, then seal and validate with `scripts/cognitive_packet.py`.

### 4. Challenge and Verify

After the seed phase, reveal normalized propositions rather than raw persuasive prose. The challenger attacks the strongest claim and the verifier checks decisive evidence or execution traces. A model reviewing only its own answer is not independent verification.

### 5. Adjudicate

Apply the evidence rules below. Do not decide by majority vote:

| Status | Admission rule | Validator |
| --- | --- | --- |
| `UNVERIFIED` | Model-generated, user-supplied, or retrieved claim without decisive support. | default |
| `SUPPORTED` | At least one verified primary artifact, direct observation, or passing execution result supports it and no decisive contradiction remains. | requires >=1 `VERIFIED` item of kind `SOURCE`/`ARTIFACT`/`EXECUTION`/`OBSERVATION` and a grounded basis |
| `CONTESTED` | Credible evidence or verified runs disagree. Preserve both branches. | standalone admission requires basis `CONTRADICTED` and two decisive lineages; a parent id alone cannot prove disagreement |
| `REFUTED` | A stronger verified source, deterministic rule, or reproducible test contradicts it. | requires decisive evidence and a cited parent |
| `CONFIRMED` | Deterministic proof/runtime evidence, or independent corroboration meeting the task's preregistered gate, with no unresolved blocker. | requires decisive `EXECUTION` evidence or >=2 distinct `independence_key` lineages |

"Decisive" excludes `MODEL_OUTPUT` and `MEMORY`. A mnemonic is an index into evidence, not evidence; a model's own assertion is the thing this protocol holds at arm's length. Neither raises a status, and neither counts as a lineage - which is why three agents repeating one fabrication cannot leave `UNVERIFIED`.

Confidence is descriptive telemetry, never an admission rule. Blind the adjudicator to agent identity when feasible. Collapse duplicate evidence by `independence_key` before calculating corroboration.

### 6. Synthesize Without Erasing Dissent

The orchestrator emits one decision packet containing:

- the accepted answer or action;
- decisive evidence and artifact references;
- rejected alternatives and why;
- unresolved uncertainty and abstentions;
- permissions consumed or still required;
- the proposed memory delta.

For a mutation, execute only after the normal permission boundary is satisfied. Then attach runtime evidence in a new packet; do not rewrite the pre-action packet.

### 7. Stage Memory

Store raw events as episodic candidates. Promote facts, mnemonics, or procedures only through Mnemosyne's existing evidence, contradiction, stability, and human/policy gates. Embedding similarity, agent agreement, or rhetorical confidence must never auto-promote memory.

### 8. Snapshot and Stop

Before compaction, handoff, or budget exhaustion, emit a `SNAPSHOT` packet with the contract hash, verified state, contested state, completed work, open frontier, last artifact hashes, and next safe action. Stop on success, exhausted evidence budget, unresolved authorization, irreducible ambiguity, or repeated rounds without new evidence.

## Context and Hallucination Controls

- Place the immutable contract and current verified-state digest at the beginning of agent context; repeat the next action and stop condition at the end.
- Retrieve only the smallest relevant memory slice. Treat retrieved items as candidates and include their source/version.
- Separate observations, inferences, hypotheses, and decisions in every packet.
- Neutralize leading language before verification. Preserve the user's request, but do not pass the user's preferred conclusion as evidence.
- When models share a family, prompt, retriever result, or upstream answer, mark that common lineage so apparent agreement is not mistaken for independence.
- Prefer primary sources and executable evidence. For changing facts, refresh rather than trusting stored prose.
- Reward calibrated refusal in evals; penalize unsupported specificity even when the final answer happens to be correct.

## Resources

- Read [protocol.md](references/protocol.md) when designing topology, handoffs, adjudication, or memory lifecycle.
- Read [packet-schema.json](references/packet-schema.json) when implementing or validating the wire format.
- Read [evals.md](references/evals.md) before deployment, protocol changes, or regression testing. The rows it marks as mechanically enforced are already executable in `tests/test_invariants.py`; the rest still need a model harness. The suite prints how many rows it actually enforced, and names every row it could not.
- Read [research-basis.md](references/research-basis.md) when explaining why the protocol uses these controls or refreshing the research basis.

```bash
# assign the deterministic id and integrity digest
python scripts/cognitive_packet.py seal PACKET.json --write

# sign it, so the digest becomes tamper-evident rather than corruption-evident
CBUS_PACKET_KEY=... python scripts/cognitive_packet.py seal PACKET.json --write --key-id orchestrator

# admit a packet to shared state
python scripts/cognitive_packet.py validate PACKET.json --require-signature

# validate a whole ledger on resume: parents resolve, clocks advance
python scripts/cognitive_packet.py chain LEDGER.json

# the invariants of references/evals.md, executable; no third-party dependency,
# so the schema/validator drift guard runs everywhere rather than skipping
python3 tests/test_invariants.py
```
