# Opt-In Brain Protocol Execution Contract

## Status

Proposed. This document describes the approved architecture; it does not
authorize implementation until the repository owner reviews this specification.

## Problem

The Vaelrix Cortex ForceField can route specialist brains, collect findings,
govern proposed tools, and emit health signals. It currently behaves as an
optional evidence service instead of an agent-amplification system:

- `ask_brain` returns `CALLER_SYNTHESIS_REQUIRED`; a caller may ignore it.
- `direct_brain.forcefield_ask()` always creates a `diagnostic` / `safety`
  task, even when the user requested an implementation, review, or architecture
  task.
- the Tool Governor records whether a request would be allowed but does not
  turn the request into an executable phase;
- success is tested as brain activation or a non-empty finding, not as a
  demonstrably better agent plan or outcome.

The system must remain strictly user-invoked. Normal agent turns must not call
the Brain Protocol, persist protocol state, or add latency merely because a
task happens to match a brain's activation signals.

## Product Contract

When the user explicitly says **"use the Brain Protocol"** (or invokes the
equivalent named skill/command), the calling agent must:

1. create an evidence-backed execution roadmap before it edits or runs
   task-changing commands;
2. execute roadmap phases automatically only to the extent that the original
   task already authorizes them under the agent's normal authority policy;
3. preserve—not relax—the normal confirmation threshold for hard-to-reverse,
   destructive, externally visible, or otherwise risky actions. It also stops
   for a material scope conflict or an unresolved ambiguity that changes the
   requested outcome;
4. produce a final receipt that distinguishes completed and independently
   verified work from proposed, blocked, or unverified work.

Explicit invocation authorizes use of the protocol and its planning work. It
is not durable advance authorization to perform a later risky action that the
agent would otherwise confirm. The protocol compiles the user's original task
into a governed plan; it cannot broaden that task, manufacture acceptance
criteria, or silently execute a tool that the calling agent itself is not
allowed to use.

## Chosen Architecture

### Invocation boundary

A new project-local `brain-protocol` agent skill is the only automatic entry
point. Its trigger is explicit user language: `use the Brain Protocol` (plus
an intentionally small documented set of exact command aliases). A reference
to brains, MoE, ForceField, SCDNA, or a domain such as `architecture` is not a
trigger.

The skill calls a new governing-MCP tool,
`mcp_scholomance_collab_brain_protocol_prepare`. Direct callers may use the
same tool, but its response advertises itself as an execution contract rather
than general advice. Existing `brain_forcefield_ask` remains a read-only,
advisory compatibility endpoint.

This division makes opt-in observable and testable: the normal path has zero
Brain Protocol calls, while the explicit path has exactly one prepare call per
protocol session (unless a documented replanning condition occurs).

### Task framing

`brain_protocol_prepare` accepts a structured request rather than only a
string:

```json
{
  "request": "the user's full task",
  "taskClass": "auto",
  "priority": "auto",
  "successCriteria": [],
  "forbiddenDrift": [],
  "workspaceContext": {
    "cwd": "/absolute/repository/path",
    "head": "optional commit",
    "dirtyPaths": []
  }
}
```

`auto` is deliberately **not** a keyword classifier. It means
`unclassified`: the compiler produces a class-neutral reconnaissance and
scope-confirmation phase, with conditional downstream branches, rather than
guessing a `TaskClassification` or `TaskPriority` from word overlap. The
calling agent may declare a class/priority when the user explicitly supplies
one; otherwise a later evidence-backed framing receipt may mark a class as
`provisional`. Provisional framing cannot by itself authorize a risky phase or
suppress a necessary verification phase.

The framing record distinguishes `declared`, `evidence_confirmed`, and
`unclassified` state. It includes the evidence or user statement behind every
non-unclassified value. Existing keyword routing may still triage specialist
brains, but it is never a proof of task class, phase necessity, or authority.
The bridge therefore no longer hard-codes `diagnostic` / `safety` for an
execution-contract request, nor silently substitutes another guessed class.

### Council and roadmap compiler

The existing ForceField remains responsible for SCDNA application, routing,
specialist execution, determinism audit, health conversion, and evidence
provenance. A new pure `RoadmapCompiler` consumes the resolved task, active
brains, accepted findings, contradictions, tool-governor decisions, and health
signals.

It returns a versioned `BrainProtocolContract`:

```text
contractVersion, protocolId, task, evidence, activeBrains,
phases[], blockedQuestions[], stopConditions[], verificationReceiptTemplate
```

Each phase has a stable ID, goal, relevant evidence references, allowed tool
classes, intended changes, completion checks, and a `requiresReplan` rule.
For an unclassified task, the roadmap starts class-neutral and makes its
branches explicit. For a declared or evidence-confirmed task, the compiler
selects only necessary phases:

- reconnaissance when the plan lacks confirmed targets;
- design only for architectural or interface-changing work;
- implementation only when the original request authorizes a change;
- verification whenever a behavior claim or change is in scope;
- handoff/receipt always.

This is a deterministic compilation step, not fabricated prose from a hidden
LLM. Specialist findings that lack evidence may be labeled as hypotheses but
cannot become confirmed implementation targets. The calling agent is still
the synthesizer and executor: the contract tells it what to do, why, and how
to verify it; it does not pretend that the Python process can operate the
agent's tools. It also cannot use a keyword-routed brain as evidence that a
semantic task class was correctly inferred.

### Agent execution discipline

The skill reads the contract and works phases in order. Before each phase it
checks the phase stop conditions; after it, it records a structured phase
receipt through `mcp_scholomance_collab_brain_protocol_record_phase`.

A phase receipt contains the phase ID, executed commands/actions, changed
paths, evidence collected, verification commands and results, and one of
`completed`, `blocked`, `skipped`, or `replan_required`. The protocol requires
a replan only when a confirmed discovery invalidates a remaining phase; it
does not repeatedly ask the council for routine work.

On completion the skill calls
`mcp_scholomance_collab_brain_protocol_finalize`, which compiles a final
receipt. It reports the original goal, roadmap phases, brain findings adopted
or rejected with reasons, changed files, verification evidence, remaining
risks, and any unverified claims. The final chat answer summarizes this receipt
instead of claiming that planning artifacts are shipped behavior.

### Persistence and isolation

Protocol state is session-scoped and stored only when an execution contract is
explicitly invoked. It is keyed by `protocolId`, not by raw prompt text. State
contains task metadata, evidence references, phase receipts, and outcome
metadata—never secrets, unredacted tool outputs, or unrelated user content.

Persistence is append-only/atomic and supports a read-only `get` operation
for resuming an interrupted protocol. It has explicit retention and deletion
rules. Initial implementation may use the existing ForceField persistence
shape only if it can meet those guarantees; otherwise it needs a separate
small ledger rather than an implicit mutable cache.

## Delivery Sequence

The full integration is deliberately gated behind a cheap efficacy probe.

1. Build a pure, in-process roadmap-compiler prototype with no persistence,
   agent skill, MCP registration, or new daemon lifecycle. Its input is a
   hand-constructed ForceField/evidence fixture and its output is an immutable
   contract; it has no side effects.
2. Run the sealed efficacy corpus against that prototype before building any
   execution infrastructure. The corpus must include (a) a meaning-agnostic
   interval-classifier-shaped task with no domain evidence and (b) a realistic
   PIXEL, LORE, or ARCHITECTURE task where an independently inspectable source
   provides real evidence.
3. Compare both against matched no-protocol planning baselines. If the
   meaning-agnostic case is null, report the null and constrain the claim to
   evidence-grounded roadmap/receipt discipline; do not call it general
   cognition amplification. If the evidence-grounded case also has no
   discriminating benefit, stop: do not build persistence, skills, or MCP
   surfaces around it.
4. Only after a positive, discriminating evidence-grounded result and an
   explicit review decision, add persistence, MCP tools, and the opt-in skill.

## Deferred Integration Surfaces

| Surface | Change |
| --- | --- |
| `steamdeck_brain/vaelrix_forcefield/types.py` | Add task-framing, roadmap, phase, and receipt data contracts. |
| `steamdeck_brain/vaelrix_forcefield/` | Add pure task framing and roadmap compilation; extend `BrainBridge` with `prepare`, phase recording, replan, and finalization. Preserve `ask`. |
| `steamdeck_brain/direct_brain.py` | Add structured command actions for prepare/status/phase/finalize and pass the caller's declared task properties. |
| `codex/server/collab/mcp-bridge.js` | Register the four explicit protocol tools and validate their schemas. No automatic interception of agent requests. |
| `.agents/skills/brain-protocol/` | Add the opt-in execution skill that binds the agent to the contract. |
| `mcp.json`, `opencode.json` | No required change if the governing bridge is already configured; update only descriptions if needed. |

## Failure Handling

- No active brain or no evidence: return a bounded reconnaissance phase, not
  an empty plan disguised as confidence.
- Specialist failure or search timeout: carry the failure into the contract as
  `UNKNOWN`; it cannot become a negative finding.
- Contradictory brain findings: create a resolution/research phase and prevent
  an implementation phase from treating either side as confirmed.
- Tool denied by the governor or host: mark the specific step blocked, state
  the reason and safe alternative, and do not claim it executed.
- Agent cannot follow the contract: final receipt is `blocked`/`incomplete`,
  never a fabricated success.
- Replan cap: one automatic replan per protocol unless the user renews the
  instruction; further invalidations become a user-facing scope decision.

## Verification Strategy

The first proof target is whether the pure compiler improves an agent plan;
the full-system proof target remains agent amplification, not mere protocol
coverage.

1. Prototype unit tests: stable roadmap compilation; `auto` stays
   unclassified rather than using keyword-derived task class; refusal to infer
   confirmation from unknown evidence; and conditional phase guards.
2. Efficacy corpus: create sealed, realistic task fixtures with ground-truth
   required discoveries and verification steps. Compare a normal agent plan
   against the protocol contract. Admit a fixture only when its matched
   baseline demonstrably misses a requirement the protocol correctly surfaces.
   Report false positives, extra tool cost, latency, and null results. Include
   the required meaning-agnostic and evidence-grounded controls from the
   delivery sequence.
3. After the efficacy gate, MCP/schema tests: protocol is unavailable without
   an explicit tool call; input validation rejects undeclared task classes and
   phase IDs; compatibility `brain_forcefield_ask` behavior remains unchanged.
4. After the efficacy gate, skill contract tests: explicit invocation causes
   prepare → phases → finalize; ordinary tasks do not call any protocol tool;
   normal destructive/scope boundaries still stop instead of being waived.
5. After the efficacy gate, end-to-end mutation trials: introduce controlled repository defects with
   predeclared oracles. The protocol must lead the executor to discriminate a
   broken baseline and produce a valid receipt; a green self-authored test
   alone is insufficient.

## Non-goals

- No background MoE invocation or hidden latency on normal tasks.
- No autonomous tool execution by the Python bridge.
- No replacement of the calling agent's safety model, permissions, or final
  judgment.
- No claim that a finite fixture corpus proves general cognition.
- No LLM synthesis requirement; the first implementation remains usable in
  deterministic, no-Ollama mode.

## Acceptance Criteria

- A user can explicitly invoke the Brain Protocol and receive a structured,
  evidence-backed roadmap with either declared/evidence-confirmed framing or
  an explicit class-neutral `unclassified` branch—never a guessed class.
- Invocation of the protocol does not waive any normal confirmation boundary;
  the designated agent executes only actions already authorized by the user's
  task under that ordinary policy.
- An ordinary agent request produces no Brain Protocol call or persisted
  protocol state.
- The final receipt lets a reviewer distinguish verified completion from a
  proposal, a blocked step, or an unverified claim.
- The pure compiler first establishes a discriminating improvement over a
  matched no-protocol baseline in an evidence-grounded scenario before any
  full infrastructure is built. A null meaning-agnostic control narrows the
  claim to evidence-grounded planning rather than general cognition.
