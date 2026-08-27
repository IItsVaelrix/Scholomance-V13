# Vaelrix ForceField Brain Network — Retrospective PDR

## Bytecode Search Code

`SCHOL-ENC-BYKE-SEARCH-PDR-VAELRIX-FORCEFIELD-BRAIN-NETWORK`

## Status

Implemented — retrospective ratification and operating contract, 2026-08-27.

## Classification

Architectural | Agent tooling | Evidence retrieval | Determinism | MCP

## Problem

The ForceField routes a task to specialist brains, joins their evidence with
SCDNA and health signals, and asks a council arbiter for a next action. It was
implemented before its product boundary was stated precisely. In particular,
the model-free path cannot synthesize a final answer, but prior output made
assembled evidence easy to mistake for one.

## Product Definition

The Vaelrix ForceField Brain Network is an **evidence-routing and decision-
preparation service**. It is not an autonomous reasoning model and it does not
claim that specialist findings are a finished user answer.

For a request, the network:

1. creates or resumes a ForceField task context;
2. applies SCDNA and signal-based specialist routing;
3. collects deterministic, domain-scoped findings;
4. audits execution determinism and tool requests;
5. arbitrates the gathered material; and
6. returns either a real synthesizer's answer or evidence explicitly marked as
   requiring caller-side synthesis.

## Intended Consumers

- MCP-compatible coding agents that can independently reason over returned
  evidence;
- the local no-LLM daemon as a transparent evidence display surface; and
- internal diagnostics that need routing, provenance, and health signals.

The network is not a source of autonomous production decisions, unreviewed
tool execution, or fabricated model output.

## Caller-Side Synthesis Contract

When `forcefield_ask(..., deterministic=True)` is used:

- `answer` is `null`;
- `synthesized` is `false`; and
- `for_agent_synthesis` is an evidence envelope, never an answer.

The envelope contains:

| Field | Required value | Meaning |
|---|---|---|
| `state` | `CALLER_SYNTHESIS_REQUIRED` | A local model did not synthesize a response. |
| `synthesized` | `false` | The material must not be presented as a finished answer. |
| `consumerAction` | `synthesize_from_evidence` | The caller owns the reasoning step. |
| `material` | assembled evidence string | Input for the caller's synthesis. |

Every consumer must branch on the envelope state before rendering or acting on
`material`. The no-LLM daemon presents a visible “UNSYNTHESIZED EVIDENCE —
CALLER MUST SYNTHESIZE” marker. The MCP bridge serializes the same envelope.

## Architecture and Safety Invariants

- The router selects brains from declared activation signals and records why.
- A brain may contribute evidence or recommendations; it may not execute a
  requested tool outside the Tool Governor.
- The determinism auditor treats missing seeds, non-deterministic tools, and
  unstable result ordering as reviewable findings.
- Model-free output never impersonates LLM synthesis.
- Specialist claims must distinguish measured data from heuristic prompts.
- The live `docs/scholomance-encyclopedia/` tree is canonical; a knowledge
  mirror is not an authority and requires a separate synchronization decision.

## Admission Criteria for a New Brain

A proposed brain may ship only when all of the following are demonstrated:

1. It has a defined user/agent decision that the evidence will improve.
2. Its evidence source is real and named, or its heuristic limitation is
   disclosed in the module documentation and output.
3. At least one regression test proves the brain's output differs from the
   shallow baseline it replaces.
4. At least three plausible request phrasings activate it through
   `BrainBridge.ask()`, not only through a direct runner call.
5. Its tool requests are compatible with the Tool Governor and deterministic
   mode.
6. Its result is not described as a synthesized answer unless a real
   synthesizer produced one.

## Scope of This Ratification

This PDR records the present model-free implementation. It does not approve an
Ollama deployment, external-tool execution, a new agent catalog integration,
or synchronization/removal of the stale knowledge mirror. Each requires its
own measured proposal.

## Verification

The current regression battery includes:

- model-free response-envelope and daemon-format tests;
- full `BrainBridge.ask()` routing tests for typography and refactor/layer
  queries; and
- specialist-brain tests against real project documentation, manifests, and
  the Scholomance dictionary.

## Ownership and Review

- Product authority: Angel
- Architecture and contract review: Codex
- Implementation and regression ownership: backend/QA

This PDR should be re-reviewed before a fourteenth brain, a non-model-free
synthesis path, or a new external consumer is approved.
