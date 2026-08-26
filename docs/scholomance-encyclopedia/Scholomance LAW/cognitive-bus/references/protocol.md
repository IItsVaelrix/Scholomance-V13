# Cognitive Bus Protocol

## 1. Architecture

The Cognitive Bus is a blackboard protocol, not a group chat. Agents work from a common contract, publish typed packets, and consume only the verified state needed for their next role.

| Layer | Responsibility | Authority boundary |
| --- | --- | --- |
| Task contract | Objective, constraints, permissions, success and stop gates | User/developer instructions |
| TurboQuant | Retrieve/rerank candidate context | Relevance only |
| SemQuant | Normalize intent and surface underspecification | Meaning normalization only |
| MemoryIR | Cross-model canonical representation | Representation only |
| Cognitive Bus ledger | Append packets, lineage, contradictions, snapshots | No truth promotion by itself |
| BytecodeHealth | Validate schema, provenance, integrity, compatibility | Admit/reject packet shape |
| LAW / Semantic Calculus | Decide allowed typed actions | Permission oracle |
| Verifier | Check sources, artifacts, tests, and runtime | Evidence status |
| Mnemosyne | Stage, promote, revise, retire memory | Existing memory gates |
| SCD64 | Diagnose static/runtime state | Diagnose-only sidecar |

When a named component is missing, preserve the seam:

- TurboQuant fallback: deterministic key/graph lookup with explicit ranking fields.
- SemQuant fallback: require the sender to state proposition, scope, assumptions, and ambiguity codes.
- MemoryIR fallback: the packet schema is the interchange representation.
- BytecodeHealth fallback: reject invalid packets with the bundled validator. Its scope is the enforcement table in SKILL.md — structure, integrity, status pricing, lineage collapse, authority, and the memory gate. It does not judge whether evidence is any good, only whether a packet has paid for the status it claims.
- LAW fallback: mark the action `authorization_ref: null` and do not mutate.
- Mnemosyne fallback: stage the memory proposal without promotion.

## 2. State Machine

```text
CONTRACT -> SEED -> REVEAL -> CHALLENGE -> VERIFY -> ADJUDICATE -> SYNTHESIZE
                ^                                           |
                |---------------- new evidence -------------|

SYNTHESIZE -> STAGE_MEMORY -> SNAPSHOT -> COMPLETE
                               |          |
                               +-> PAUSED +-> FAILED_SAFE
```

Transitions are driven by packet intent and verified gates, not by prose such as “everyone agrees.” Every round must add new evidence, remove a contradiction, execute a test, or reduce uncertainty. Otherwise stop.

## 3. Task Contract

Minimum contract:

```json
{
  "task_id": "stable-user-or-project-id",
  "objective": "observable desired outcome",
  "success_criteria": ["specific pass condition"],
  "constraints": ["binding rule"],
  "allowed_actions": ["read", "analyze"],
  "evidence_standard": "primary source or reproducible execution",
  "round_budget": 3,
  "stop_conditions": ["success", "no new evidence", "authorization required"],
  "output_owner": "orchestrator"
}
```

Hash the canonical contract. A handoff receiver must acknowledge the same hash before acting. A mismatch creates a `CHALLENGE` packet and pauses mutation.

## 4. Communication Phases

### Independent seed

Each investigator receives:

1. the contract;
2. verified baseline facts;
3. its bounded role;
4. relevant tools and authorization;
5. no peer conclusion.

The agent returns claim packets plus artifact references. This phase creates epistemic diversity; changing only the role prompt while all agents read the same proposed answer does not.

### Normalized reveal

Strip style and identity cues before comparison. Compare canonical propositions, evidence ids, assumptions, method, and result. Keep raw output only as an auditable artifact when necessary.

### Challenge

Attack at least:

- the highest-impact unsupported proposition;
- the common evidence lineage;
- the assumption shared by all candidate answers;
- the permission boundary of any proposed action.

The challenger must cite evidence or construct a reproducible counterexample. Mere disagreement does not lower status.

### Verification

Prefer this evidence order unless the task defines a stricter one:

1. deterministic proof, invariant, or reproducible runtime result;
2. primary authoritative artifact/source;
3. independently corroborated primary sources;
4. secondary synthesis with traceable citations;
5. retrieved memory or user statement;
6. model-only inference.

Temporal claims require freshness metadata. Code claims require repository state plus tests or traces. A verifier cannot mark its own unsupported generation `CONFIRMED`.

## 5. Evidence Lineage

Every evidence item has an `independence_key`. Use the same key when items share the decisive origin, including:

- the same document, dataset row, test fixture, or API response;
- summaries derived from one paper;
- several agents copying an upstream agent;
- several samples from one model call lineage when no external evidence differs.

Corroboration is calculated over unique verified independence keys. Agent count is telemetry only.

## 6. Adjudication

For each proposition:

1. Normalize the proposition and scope.
2. Gather supporting and contradicting evidence.
3. Collapse duplicate lineages.
4. Rank evidence by the task's preregistered hierarchy.
5. Apply deterministic rules or LAW.
6. Assign status and uncertainty codes.
7. Preserve losing evidence and the reason for rejection.
8. Emit a new decision packet that cites its parents.

If evidence remains balanced, status is `CONTESTED`, not the average of confidence scores. If no decisive evidence exists, use `ABSTAIN` or `UNVERIFIED`.

## 7. Memory Lifecycle

| Stratum | Content | Write rule |
| --- | --- | --- |
| Episodic | What happened in one run | Stage with task, packet, and artifact provenance |
| Semantic | Stable fact or relation | Promote only through Mnemosyne's evidence/stability gate |
| Mnemonic | Retrieval cue for semantic memory | Index only; never evidence by itself |
| Procedural | Reusable verified method | Require repeated successful execution and versioned scope |

Contradiction never deletes history. A revision points to the superseded memory and keeps the evidence that caused the change. Retirement prevents retrieval by default but remains auditable.

## 8. Snapshot and Resume

A snapshot contains:

- contract id and hash;
- highest logical clock;
- verified proposition ids;
- contested proposition ids and both evidence branches;
- artifact ids and hashes;
- permissions already consumed;
- memory proposals awaiting review;
- exact next action and stop condition.

On resume, validate the packet chain and artifact hashes with `cognitive_packet.py chain LEDGER.json`: every `parent_ids` entry must resolve inside the ledger and every logical clock must exceed its parents'. If bytes are missing or the contract changed, emit a challenge and re-verify only the affected frontier.

An unsigned ledger survives this check only against accident. A resumed ledger that crossed a trust boundary should be signed and validated with `--require-signature`.

## 9. Bounded Operation

Default budgets should be explicit: number of agents, rounds, retrieved items, token/context allocation, external calls, and mutation attempts. A retry must add information or use a materially different verification method. Stop after two consecutive no-information rounds unless the contract says otherwise.
