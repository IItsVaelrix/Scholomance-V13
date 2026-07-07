PDR: QBIT Immune Checkpoint v1
Status

Proposed

Problem

The current RAID diagnostic flow emits violations immediately after a rule fires. This works for known, high-confidence bug patterns, but it lacks an evidence gate between detection and accusation.

Current flow:

rule fires
  → violation emitted
  → adaptive layer may learn afterward

This creates three problems:

False positives can repeat across agents and runs.
Confirmed recurring failures are not promoted early enough.
Rules do not accumulate reputation over time.

The repo already contains most of the biological substrate:

QbitMemoryPersistence.js: deterministic persistent memory envelopes.
BytecodeXPVaccine.js: known-pattern vaccination model.
pathogenRegistry.js: learned confirmed pathogens.
adaptive.scanner.js: adaptive detection layer.
memory-infusion.engine.js: long-term event infusion.

The missing organelle is a checkpoint.

Proposal

Introduce an immune checkpoint between rule detection and violation emission.

New flow:

rule fires
  → encode deterministic bytecode envelope
  → query QBIT immune memory
  → compare confirms/refutes/decay/confidence
  → emit violation, warn, suppress, or escalate
  → update memory cell
Core Concept

A rule firing is not automatically a violation. It is an observation.

The checkpoint decides whether that observation should become:

VIOLATION
WARN
HEALTH_SIGNAL
SUPPRESSED
NEEDS_MERLIN
Deterministic Memory Key

Each checkpoint lookup should use a stable key:

<ruleId>:<normalizedFilePath>:<normalizedLocationHash>:<bytecodeShapeHash>

Example:

LAYOUT_THRASHING:src/ui/WandPage.jsx:line354:shape.a93f12

The key should avoid unstable data:

no timestamps
no absolute local paths
no machine-specific separators
no runtime object key order
no noncanonical stack traces
Memory Cell Shape
{
  version: 1,

  key: "LAYOUT_THRASHING:src/ui/WandPage.jsx:line354:shape.a93f12",

  ruleId: "LAYOUT_THRASHING",
  filePath: "src/ui/WandPage.jsx",
  locationHash: "line354",
  bytecodeShapeHash: "shape.a93f12",

  confirms: 0,
  refutes: 7,
  warnings: 2,

  lastVerdict: "REFUTED",
  lastObservedAt: "deterministic-logical-clock-or-run-index",

  halfLifeRuns: 30,

  confidence: {
    confirmScore: 0,
    refuteScore: 0.82,
    net: -0.82
  },

  reputation: {
    ruleReliability: 0.41,
    localFalsePositiveRate: 0.78
  },

  history: [
    {
      runId: "run.00041",
      verdict: "REFUTED",
      evidenceHash: "evidence.13bc"
    }
  ]
}
Checkpoint Decision Logic
export function evaluateImmuneCheckpoint({
  observation,
  memoryCell,
  config
}) {
  const decayed = applyMemoryHalfLife({
    memoryCell,
    currentRunIndex: observation.runIndex
  });

  const confirmScore = decayed.confirms;
  const refuteScore = decayed.refutes;

  const hasMinimumSignal =
    confirmScore + refuteScore >= config.minimumEvidenceCount;

  if (!hasMinimumSignal) {
    return {
      action: "WARN",
      reason: "INSUFFICIENT_MEMORY_SIGNAL"
    };
  }

  if (refuteScore > confirmScore * config.refuteSuppressionThreshold) {
    return {
      action: "HEALTH_SIGNAL",
      reason: "MEMORY_REFUTES_RULE"
    };
  }

  if (confirmScore > refuteScore * config.confirmViolationThreshold) {
    return {
      action: "VIOLATION",
      reason: "MEMORY_CONFIRMS_RULE"
    };
  }

  return {
    action: "WARN",
    reason: "MIXED_OR_UNSTABLE_MEMORY"
  };
}
G1 Pre-Checkpoint

A memory cell should not be allowed to suppress a rule unless the observation itself meets a minimum signal floor.

This prevents noisy early runs from teaching the immune system to ignore real bugs.

export function passesG1SignalFloor(observation, config) {
  return (
    observation.ruleConfidence >= config.minRuleConfidence &&
    observation.evidenceCount >= config.minEvidenceCount &&
    observation.bytecodeShapeHash != null
  );
}

If the observation fails the G1 floor:

emit WARN
do not suppress
do not promote
record weak observation only
G2/M Checkpoint

The G2/M checkpoint runs after deterministic bytecode encoding and before emission.

rule fired
  → G1 signal floor
  → bytecode envelope
  → QBIT memory lookup
  → G2/M checkpoint
  → emit final diagnostic
Emission Actions
VIOLATION

Used when current observation and memory both support the rule.

rule fires + memory confirms = violation
WARN

Used when evidence is insufficient, mixed, cold-started, or unstable.

rule fires + weak memory = warning
HEALTH_SIGNAL

Used when the rule fired, but memory strongly refutes it.

rule fires + strong refute history = health signal

This is not silence. It is evidence-aware non-accusation.

SUPPRESSED

Reserved for high-confidence refutes after the system has enough evidence.

This should be rarer than HEALTH_SIGNAL.

NEEDS_MERLIN

Used when the shape is suspicious but does not match known registry patterns or memory expectations.

unknown antigen detected
  → do not force match
  → escalate classification
Integration Points
QbitMemoryPersistence.js

Stores and retrieves checkpoint memory cells.

New responsibilities:

getCheckpointCell(key)
upsertCheckpointCell(key, observationResult)
applyHalfLifeDecay(cell, runIndex)
BytecodeXPVaccine.js

Provides known-bug immunity for confirmed patterns.

Checkpoint should consult vaccines before memory suppression.

Order:

vaccine match
  → known pathogen handling

no vaccine match
  → checkpoint memory handling
pathogenRegistry.js

Promotes repeated confirmed violations into adaptive pathogens.

checkpoint confirms recurring bug
  → pathogenRegistry.promoteCandidate()
adaptive.scanner.js

Receives promoted candidates, not every noisy rule fire.

memory-infusion.engine.js

Infuses final checkpoint verdicts into persistent QBIT memory.

Rule Reputation

Rules should accumulate reliability scores.

A rule with high refute rates should trigger apoptosis review:

rule false-positive rate exceeds threshold
  → mark rule as unstable
  → emit RULE_APOPTOSIS_CANDIDATE
  → require Merlin review before disabling globally

This avoids silently killing useful diagnostics.

Configuration
export const ImmuneCheckpointConfig = {
  minimumEvidenceCount: 3,

  minRuleConfidence: 0.55,
  minEvidenceCount: 2,

  refuteSuppressionThreshold: 2.0,
  confirmViolationThreshold: 1.5,

  halfLifeRuns: 30,

  allowHardSuppression: false,

  merlinEscalation: {
    enabled: true,
    unknownShapeThreshold: 0.72,
    contradictionThreshold: 0.8
  }
};
Example

Input:

Rule fires:
LAYOUT_THRASHING at WandPage.jsx:354

Checkpoint lookup:

{
  confirms: 0,
  refutes: 7,
  verdict: "REFUTED"
}

Decision:

refutes > confirms × threshold

Output:

HEALTH_SIGNAL

Memory update:

observation stored
rule reputation adjusted
no violation emitted
Non-Goals

This PDR does not propose:

Human-authored suppression comments.
Permanent global disabling of rules.
Replacing the pathogen registry.
Replacing Merlin classification.
Nondeterministic ML-based verdicting.

The checkpoint is deterministic evidence governance, not a vibes tribunal.

QA Checklist
Determinism
Same observation produces same checkpoint key.
Same memory state produces same action.
Memory updates are canonical JSON.
Checksums remain stable across agents.
Suppression Safety
Cold-start observations do not hard-suppress.
Weak evidence only emits WARN.
Refute memory decays over time.
Strong new evidence can override old refutes.
Promotion Safety
Repeated confirmed observations promote candidates.
Candidates do not become pathogens until threshold is met.
Merlin can review unknown or contradictory shapes.
Regression Tests
Known confirmed pathogen emits violation.
Known refuted false positive emits health signal.
Unknown suspicious shape emits NEEDS_MERLIN.
Cold-start rule emits warning.
Old refute memory decays after enough runs.
High-refute rule becomes apoptosis candidate.
Vaccine match bypasses local refute suppression.
Risks
Autoimmune Risk

The system may suppress real bugs because early observations were false positives.

Mitigation:

G1 signal floor
half-life decay
no hard suppression by default
Merlin contradiction escalation
Memory Drift

Old refutes may remain influential after the code changes.

Mitigation:

file content hash
bytecode shape hash
half-life decay
schema versioning
Registry Fragmentation

Similar bug shapes may produce too many keys.

Mitigation:

normalized shape hash
path normalization
optional fuzzy family key
Merlin clustering
Overfitting to Location

A bug may move lines and lose memory.

Mitigation:

prefer AST node hash or bytecode shape hash over raw line number
use line as secondary metadata only
Final Decision

Build QBIT Immune Checkpoint v1 as an integration layer, not a replacement layer.

The system already has memory, vaccines, pathogens, adaptive scanning, and infusion.

The checkpoint gives those organs a bloodstream.

Code

The first implementation should be small and composable:

codex/core/immune/
  qbit-immune-checkpoint.js
  qbit-immune-checkpoint.config.js
  qbit-immune-checkpoint.test.js
Minimal public boundary
export function checkpointDiagnosticObservation({
  observation,
  memory,
  vaccines,
  config
}) {
  const g1 = passesG1SignalFloor(observation, config);

  if (!g1.pass) {
    return {
      action: "WARN",
      reason: "FAILED_G1_SIGNAL_FLOOR",
      observation
    };
  }

  const vaccineVerdict = vaccines.match(observation.bytecodeEnvelope);

  if (vaccineVerdict?.matched) {
    return {
      action: "VIOLATION",
      reason: "VACCINE_MATCH_CONFIRMED_PATHOGEN",
      vaccineVerdict
    };
  }

  const memoryCell = memory.get(observation.checkpointKey);

  return evaluateImmuneCheckpoint({
    observation,
    memoryCell,
    config
  });
}
QA checklist
Cold start: first-time layout thrash emits WARN, not hard violation suppression.
Confirmed pathogen: vaccine match still emits VIOLATION.
Refuted local false positive: repeated refutes emit HEALTH_SIGNAL.
Novel antigen: unknown suspicious shape emits NEEDS_MERLIN.
Decay: old refutes lose power after half-life.
Rule apoptosis: high-refute rules are flagged, not silently deleted.
Determinism: checkpoint key and verdict are stable across agents.
Next risks

The big danger is letting memory become a blunt silencer.

So the safest first version should default to:

HEALTH_SIGNAL instead of SUPPRESSED
WARN instead of VIOLATION when uncertain
NEEDS_MERLIN instead of forced classification

That gives you immune intelligence without autoimmune arrogance.