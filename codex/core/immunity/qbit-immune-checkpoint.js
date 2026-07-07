/**
 * QBIT IMMUNE CHECKPOINT v1
 *
 * The evidence gate between rule detection and violation emission.
 *
 * Implements PDR: docs/scholomance-encyclopedia/PDR-archive/QBIT-Immune-Checkpoint-PDR.md
 *
 * Flow (per PDR):
 *   rule fires
 *     → G1 signal floor
 *     → bytecode envelope
 *     → QBIT memory lookup (via injected memory adapter)
 *     → vaccine match (via injected vaccines adapter)
 *     → G2/M checkpoint decision
 *     → emit final diagnostic
 *
 * This module is the integration seam. It does NOT replace:
 *   - QbitMemoryPersistence.js (storage)
 *   - BytecodeXPVaccine.js   (known-bug registry)
 *   - pathogenRegistry.js    (pathogen identity)
 *   - adaptive.scanner.js    (semantic detection)
 *   - memory-infusion.engine.js (private-scar infusion)
 *
 * Callers inject `memory` and `vaccines` adapters so the checkpoint remains
 * a pure, dependency-free function. The only IO is at the integration seam.
 *
 * Law compliance:
 *   - VAELRIX_LAW §6 (Determinism): no Date.now/Math.random/Object-key order
 *   - VAELRIX_LAW §8 (Bytecode): canonical JSON for memory updates,
 *     stable 12-hex checksums matching existing module convention
 *   - VAELRIX_LAW §9 (No global mutable state)
 *   - VAELRIX_LAW §5 (Pure analysis never touches effects)
 */

import crypto from 'node:crypto';
import {
  encodeBytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../pixelbrain/bytecode-error.js';
import {
  ImmuneCheckpointConfig,
  IMMUNE_CHECKPOINT_ACTIONS,
  IMMUNE_CHECKPOINT_VERDICTS,
} from './qbit-immune-checkpoint.config.js';

const DEFAULT_LOCATION_HASH = 'loc.absent';
const DEFAULT_BYTECODE_SHAPE = 'shape.absent';

const PATH_NORMALIZE_REGEX = /\\/g;

/**
 * Normalize a file path to a stable cross-platform key fragment.
 * - Forward slashes only
 * - No leading "../" or "./" fragments beyond one level
 * - No absolute filesystem prefixes
 * - No whitespace
 */
export function normalizeFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return 'path.absent';
  }
  const slashed = filePath.replace(PATH_NORMALIZE_REGEX, '/').trim();
  const noPrefix = slashed.replace(/^(?:\.\/)+/, '').replace(/^(?:\.\.\/)+/, '');
  const collapsed = noPrefix.replace(/\/{2,}/g, '/');
  return collapsed.length === 0 ? 'path.absent' : collapsed;
}

/**
 * Build a stable, cross-machine location key fragment.
 *
 * Accepts any of:
 *   - a number (line number, treated as "line<N>")
 *   - a string ("line354", "node.ast-1f3b", "shape.a93f12", etc.)
 *   - an object { line, column, astNodeId, fn, scope } — canonicalized via
 *     stable JSON; an `astNodeId` is preferred over a raw line per PDR §"Risks"
 *
 * The output is `loc.<stableHash>` so an attacker cannot smuggle a hostile
 * key fragment. If a caller already has a stable hash, prefix it with `loc.`
 * directly and pass through.
 */
export function normalizeLocationHash(location) {
  if (location === null || location === undefined) {
    return DEFAULT_LOCATION_HASH;
  }
  if (typeof location === 'number' && Number.isFinite(location)) {
    return `line${Math.trunc(location)}`;
  }
  if (typeof location === 'string') {
    const trimmed = location.trim();
    if (trimmed.length === 0) return DEFAULT_LOCATION_HASH;
    if (trimmed.startsWith('loc.') || trimmed.startsWith('line') || trimmed.startsWith('node.')) {
      return trimmed;
    }
    return `loc.${shortHash(trimmed)}`;
  }
  if (typeof location === 'object') {
    const stable = stableClone({
      astNodeId: location.astNodeId ?? null,
      line: Number.isFinite(location.line) ? Math.trunc(location.line) : null,
      column: Number.isFinite(location.column) ? Math.trunc(location.column) : null,
      fn: typeof location.fn === 'string' ? location.fn : null,
      scope: typeof location.scope === 'string' ? location.scope : null,
    });
    if (!stable.astNodeId && stable.line === null) return DEFAULT_LOCATION_HASH;
    // astNodeId is already a stable identifier (per PDR §"Overfitting to
    // Location"); do not re-hash it. The "loc." prefix is reserved for
    // hashed composite location fragments (line + column + fn).
    if (stable.astNodeId) return `node.${stable.astNodeId}`;
    return `loc.${shortHash(stableJson(stable))}`;
  }
  return DEFAULT_LOCATION_HASH;
}

/**
 * Compute a stable 12-hex "shape.a93f12..." key from a bytecode envelope.
 * The envelope may be a string, a Uint8Array, a Buffer, or a structured
 * object whose canonical JSON is hashed.
 */
export function computeBytecodeShapeHash(bytecodeEnvelope) {
  if (bytecodeEnvelope === null || bytecodeEnvelope === undefined) {
    return DEFAULT_BYTECODE_SHAPE;
  }
  if (typeof bytecodeEnvelope === 'string') {
    if (bytecodeEnvelope.length === 0) return DEFAULT_BYTECODE_SHAPE;
    if (bytecodeEnvelope.startsWith('shape.')) return bytecodeEnvelope;
    return `shape.${shortHash(bytecodeEnvelope)}`;
  }
  if (bytecodeEnvelope instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(bytecodeEnvelope))) {
    return `shape.${crypto.createHash('sha256').update(bytecodeEnvelope).digest('hex').slice(0, 12)}`;
  }
  if (typeof bytecodeEnvelope === 'object') {
    return `shape.${shortHash(stableJson(bytecodeEnvelope))}`;
  }
  return `shape.${shortHash(String(bytecodeEnvelope))}`;
}

/**
 * Build the canonical checkpoint key per PDR §"Deterministic Memory Key".
 *
 *   <ruleId>:<normalizedFilePath>:<normalizedLocationHash>:<bytecodeShapeHash>
 *
 * Stable across agents, machines, and runs.
 */
export function buildCheckpointKey({ ruleId, filePath, location, bytecodeShapeHash }) {
  const safeRule = typeof ruleId === 'string' && ruleId.length > 0
    ? ruleId.replace(/[\s:]+/g, '_')
    : 'rule.absent';
  const pathPart = normalizeFilePath(filePath);
  const locPart = normalizeLocationHash(location);
  const shapePart = bytecodeShapeHash
    ? computeBytecodeShapeHash(bytecodeShapeHash)
    : DEFAULT_BYTECODE_SHAPE;
  return `${safeRule}:${pathPart}:${locPart}:${shapePart}`;
}

/**
 * G1 PRE-CHECKPOINT — minimum signal floor.
 *
 * PDR says: "A memory cell should not be allowed to suppress a rule unless
 * the observation itself meets a minimum signal floor."
 *
 * Returns { pass: true } on success and { pass: false, reason } on failure.
 * The caller MUST emit WARN and skip G2 if pass === false.
 */
export function passesG1SignalFloor(observation, config = ImmuneCheckpointConfig) {
  if (!observation || typeof observation !== 'object') {
    return { pass: false, reason: 'OBSERVATION_MISSING' };
  }
  if (typeof observation.ruleId !== 'string' || observation.ruleId.length === 0) {
    return { pass: false, reason: 'RULE_ID_MISSING' };
  }
  if (typeof observation.filePath !== 'string' || observation.filePath.length === 0) {
    return { pass: false, reason: 'FILE_PATH_MISSING' };
  }
  const confidence = Number(observation.ruleConfidence);
  if (!Number.isFinite(confidence) || confidence < config.minRuleConfidence) {
    return { pass: false, reason: 'RULE_CONFIDENCE_BELOW_FLOOR' };
  }
  const evidence = Number(observation.evidenceCount);
  if (!Number.isFinite(evidence) || evidence < config.minEvidenceCount) {
    return { pass: false, reason: 'EVIDENCE_BELOW_FLOOR' };
  }
  if (!observation.bytecodeEnvelope) {
    return { pass: false, reason: 'NO_BYTECODE_ENVELOPE' };
  }
  return { pass: true };
}

/**
 * Apply half-life decay to a memory cell's confirm / refute / warning counts.
 *
 * The half-life is measured in checkpoint runs. Each time the cell is
 * observed, its counters are weighted toward zero using:
 *
 *   decayed = floor(count * exp(-ln(2) * (currentRunIndex - lastObservedRun) / halfLifeRuns))
 *
 * We use `floor` rather than `round` so decay is monotonically non-increasing:
 * evidence never gains power through the passage of time. This matches the
 * PDR's "Strong new evidence can override old refutes" intent — only fresh
 * observations can lift a verdict.
 */
export function applyMemoryHalfLife(cell, currentRunIndex, config = ImmuneCheckpointConfig) {
  if (!cell || typeof cell !== 'object') {
    return null;
  }
  const lastRun = Number.isFinite(cell.lastObservedAt) ? cell.lastObservedAt : currentRunIndex;
  const halfLife = Math.max(1, Number(config.halfLifeRuns) || ImmuneCheckpointConfig.halfLifeRuns);
  const elapsed = Math.max(0, currentRunIndex - lastRun);
  const decayFactor = Math.exp((-Math.LN2 * elapsed) / halfLife);
  const decayedCount = (n) => {
    const numeric = Number(n);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.max(0, Math.floor(numeric * decayFactor));
  };
  return stableClone({
    ...cell,
    confirms: decayedCount(cell.confirms),
    refutes: decayedCount(cell.refutes),
    warnings: decayedCount(cell.warnings),
    lastObservedAt: lastRun,
  });
}

/**
 * Build an initial memory cell for a (rule, file, location, shape) tuple.
 * The cell is frozen; updates return new cells.
 */
export function createDefaultMemoryCell({ key, ruleId, filePath, locationHash, bytecodeShapeHash, runIndex = 0 } = {}) {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('createDefaultMemoryCell requires a non-empty key');
  }
  return stableClone({
    version: 1,
    key,
    ruleId: ruleId || null,
    filePath: filePath || null,
    locationHash: locationHash || null,
    bytecodeShapeHash: bytecodeShapeHash || null,

    confirms: 0,
    refutes: 0,
    warnings: 0,

    lastVerdict: 'INSUFFICIENT',
    lastObservedAt: runIndex,

    halfLifeRuns: ImmuneCheckpointConfig.halfLifeRuns,

    confidence: {
      confirmScore: 0,
      refuteScore: 0,
      net: 0,
    },

    reputation: {
      ruleReliability: 1.0,
      localFalsePositiveRate: 0.0,
    },

    history: [],
  });
}

/**
 * Update a memory cell with the result of one observation.
 *
 * Returns a NEW cell. The caller is responsible for persisting it via the
 * injected `memory` adapter's upsert method.
 *
 * Decay is NOT applied here — the cell stores RAW counts and
 * `evaluateImmuneCheckpoint` applies half-life at evaluation time. Mixing
 * write-time decay with read-time decay causes cascading loss where each
 * new observation wipes most prior evidence; that is NOT what the PDR
 * intends ("Strong new evidence can override old refutes").
 */
export function updateMemoryCellWithObservation(cell, observation, runIndex, config = ImmuneCheckpointConfig) {
  const base = cell && typeof cell === 'object' ? cell : createDefaultMemoryCell({
    key: observation?.checkpointKey,
    ruleId: observation?.ruleId,
    filePath: observation?.filePath,
    locationHash: observation?.locationHash,
    bytecodeShapeHash: observation?.bytecodeShapeHash,
    runIndex,
  });

  const confirms = base.confirms;
  const refutes = base.refutes;
  const warnings = base.warnings;

  const nextCounters = { confirms, refutes, warnings };
  const verdict = String(observation?.verdict || '').toUpperCase();
  if (verdict === 'CONFIRMED') nextCounters.confirms += 1;
  else if (verdict === 'REFUTED') nextCounters.refutes += 1;
  else if (verdict === 'WARN' || verdict === 'MIXED') nextCounters.warnings += 1;

  const totalObservations = nextCounters.confirms + nextCounters.refutes + nextCounters.warnings;
  const localFalsePositiveRate = totalObservations > 0
    ? round3(nextCounters.refutes / totalObservations)
    : 0;
  const ruleReliability = clamp01(1 - localFalsePositiveRate * 0.5);

  return stableClone({
    ...base,
    confirms: nextCounters.confirms,
    refutes: nextCounters.refutes,
    warnings: nextCounters.warnings,
    lastVerdict: verdict || base.lastVerdict,
    lastObservedAt: runIndex,
    confidence: {
      confirmScore: nextCounters.confirms,
      refuteScore: nextCounters.refutes,
      net: nextCounters.confirms - nextCounters.refutes,
    },
    reputation: {
      ruleReliability,
      localFalsePositiveRate,
    },
    history: appendHistory(base.history, {
      runId: observation?.runId || `run.${String(runIndex).padStart(5, '0')}`,
      verdict: verdict || base.lastVerdict,
      evidenceHash: observation?.evidenceHash || null,
    }),
  });
}

/**
 * G2/M CHECKPOINT — evaluate the post-decay memory state.
 *
 * Returns one of:
 *   { action: 'VIOLATION',      reason: 'MEMORY_CONFIRMS_RULE' }
 *   { action: 'HEALTH_SIGNAL',  reason: 'MEMORY_REFUTES_RULE' }
 *   { action: 'WARN',           reason: 'INSUFFICIENT_MEMORY_SIGNAL' | 'MIXED_OR_UNSTABLE_MEMORY' }
 *
 * Note: NEEDS_MERLIN is NOT emitted by this evaluator. The PDR reserves
 * NEEDS_MERLIN for "unknown suspicious shape" — a novelty signal — and that
 * decision is owned by the top-level boundary `checkpointDiagnosticObservation`
 * where a missing memory cell is interpreted as a novel antigen. Keeping
 * the G2 evaluator pure means callers can compose it freely.
 */
export function evaluateImmuneCheckpoint({ observation, memoryCell, config = ImmuneCheckpointConfig } = {}) {
  const safeConfig = mergeConfig(config);
  if (!memoryCell || typeof memoryCell !== 'object') {
    return { action: 'WARN', reason: 'INSUFFICIENT_MEMORY_SIGNAL' };
  }
  const decayed = applyMemoryHalfLife(memoryCell, observation?.runIndex || 0, safeConfig);
  const confirmScore = decayed.confirms;
  const refuteScore = decayed.refutes;
  const hasMinimumSignal = (confirmScore + refuteScore) >= safeConfig.minimumEvidenceCount;

  if (!hasMinimumSignal) {
    return { action: 'WARN', reason: 'INSUFFICIENT_MEMORY_SIGNAL' };
  }

  if (refuteScore > confirmScore * safeConfig.refuteSuppressionThreshold) {
    return { action: 'HEALTH_SIGNAL', reason: 'MEMORY_REFUTES_RULE' };
  }

  if (confirmScore > refuteScore * safeConfig.confirmViolationThreshold) {
    return { action: 'VIOLATION', reason: 'MEMORY_CONFIRMS_RULE' };
  }

  return { action: 'WARN', reason: 'MIXED_OR_UNSTABLE_MEMORY' };
}

/**
 * Rule reputation / apoptosis check.
 *
 * If a rule accumulates refutes far in excess of confirms, the checkpoint
 * emits a RULE_APOPTOSIS_CANDIDATE signal. The PDR requires Merlin review
 * before any rule is globally disabled — apoptosis is a candidate, not a
 * silent kill.
 */
export function evaluateRuleReputation({ ruleId, memoryCell, config = ImmuneCheckpointConfig } = {}) {
  const safeConfig = mergeConfig(config);
  const reputation = memoryCell?.reputation || {};
  const observations = (memoryCell?.confirms || 0) + (memoryCell?.refutes || 0) + (memoryCell?.warnings || 0);
  const enoughData = observations >= safeConfig.ruleReputation.minObservations;
  const highRefute = (reputation.localFalsePositiveRate || 0) >= safeConfig.ruleReputation.refuteRatioForApoptosis;
  const isCandidate = enoughData && highRefute;

  if (!isCandidate) {
    return { candidate: false, reason: 'REPUTATION_STABLE' };
  }
  return {
    candidate: true,
    reason: 'RULE_APOPTOSIS_CANDIDATE',
    ruleId,
    observationCount: observations,
    localFalsePositiveRate: reputation.localFalsePositiveRate,
    bytecode: emitApoptosisBytecode({ ruleId, memoryCell, config: safeConfig }),
  };
}

/**
 * TOP-LEVEL PUBLIC BOUNDARY.
 *
 * PDR §"Code / Minimal public boundary":
 *
 *   checkpointDiagnosticObservation({ observation, memory, vaccines, config })
 *
 * Adapters are injected so the checkpoint remains pure. The adapters must
 * implement:
 *
 *   vaccines.match(envelope) -> { matched: boolean, vaccine?: object, pathogenId?: string }
 *   memory.get(key)          -> MemoryCell | null
 *   memory.upsert(key, cell) -> { ok: boolean }  (optional, but recommended)
 *
 * Returns a stable, structured verdict suitable for the diagnostic emitter.
 */
export function checkpointDiagnosticObservation({
  observation,
  memory,
  vaccines,
  config = ImmuneCheckpointConfig,
  runIndex = 0,
  runId = `run.${String(runIndex).padStart(5, '0')}`,
} = {}) {
  if (!observation || typeof observation !== 'object') {
    return {
      action: 'WARN',
      reason: 'OBSERVATION_MISSING',
      verdict: 'INSUFFICIENT',
      observation: null,
      memoryCell: null,
      vaccineVerdict: null,
      key: null,
    };
  }

  const safeConfig = mergeConfig(config);
  const enrichedObservation = {
    ...observation,
    runIndex,
    runId,
  };

  // G1 signal floor — early exit on WARN, do not touch memory.
  const g1 = passesG1SignalFloor(enrichedObservation, safeConfig);
  if (!g1.pass) {
    return {
      action: 'WARN',
      reason: 'FAILED_G1_SIGNAL_FLOOR',
      verdict: 'G1_FAILED',
      g1FailureReason: g1.reason,
      observation: enrichedObservation,
      memoryCell: null,
      vaccineVerdict: null,
      key: null,
    };
  }

  // Vaccine match — known pathogen always wins.
  let vaccineVerdict = null;
  if (vaccines && typeof vaccines.match === 'function') {
    try {
      vaccineVerdict = vaccines.match(enrichedObservation.bytecodeEnvelope) || null;
    } catch (error) {
      vaccineVerdict = { matched: false, error: String(error?.message || error) };
    }
  }
  if (vaccineVerdict?.matched) {
    return {
      action: 'VIOLATION',
      reason: 'VACCINE_MATCH_CONFIRMED_PATHOGEN',
      verdict: 'VACCINE_MATCH',
      observation: enrichedObservation,
      memoryCell: null,
      vaccineVerdict,
      key: null,
    };
  }

  // Memory lookup — fall through to G2/M evaluation.
  const key = buildCheckpointKey({
    ruleId: enrichedObservation.ruleId,
    filePath: enrichedObservation.filePath,
    location: enrichedObservation.location,
    bytecodeShapeHash: enrichedObservation.bytecodeShapeHash || enrichedObservation.bytecodeEnvelope,
  });

  let memoryCell = null;
  if (memory && typeof memory.get === 'function') {
    try {
      memoryCell = memory.get(key);
    } catch (error) {
      memoryCell = null;
    }
  }

  // Novel antigen detection: a no-memory observation that the caller
  // explicitly flagged as a "suspect novel antigen" escalates to Merlin
  // for human review (PDR §"Emission Actions / NEEDS_MERLIN"). The
  // checkpoint does NOT infer novelty from confidence or evidence counts
  // — that would convert routine first-time observations into escalations
  // and conflict with the QA "Cold start emits WARN" invariant.
  if (!memoryCell && enrichedObservation.suspectNovelAntigen === true
    && safeConfig.merlinEscalation?.enabled) {
    return {
      action: 'NEEDS_MERLIN',
      reason: 'NOVEL_ANTIGEN_FLAGGED',
      verdict: 'NEEDS_MERLIN',
      observation: enrichedObservation,
      memoryCell: null,
      vaccineVerdict,
      reputation: { candidate: false, reason: 'NO_DATA' },
      key,
    };
  }

  const evaluation = evaluateImmuneCheckpoint({
    observation: enrichedObservation,
    memoryCell,
    config: safeConfig,
  });

  const verdict = verdictForAction(evaluation.action, evaluation.reason);
  const reputation = evaluateRuleReputation({
    ruleId: enrichedObservation.ruleId,
    memoryCell,
    config: safeConfig,
  });

  // Build the post-observation cell WITHOUT persisting. Caller chooses to
  // upsert via the injected memory adapter.
  const nextCell = updateMemoryCellWithObservation(memoryCell, {
    ...enrichedObservation,
    checkpointKey: key,
    locationHash: normalizeLocationHash(enrichedObservation.location),
    verdict,
  }, runIndex, safeConfig);

  return {
    action: evaluation.action,
    reason: evaluation.reason,
    verdict,
    observation: enrichedObservation,
    memoryCell: nextCell,
    vaccineVerdict,
    reputation,
    key,
  };
}

/**
 * Persist a memory cell through the injected memory adapter.
 * Pure pass-through with stable error wrapping.
 */
export function persistCheckpointCell(memory, key, cell) {
  if (!memory || typeof memory.upsert !== 'function') {
    return { ok: false, reason: 'NO_MEMORY_ADAPTER' };
  }
  try {
    const result = memory.upsert(key, cell);
    return { ok: true, result: result ?? null };
  } catch (error) {
    return { ok: false, reason: 'UPSERT_FAILED', error: String(error?.message || error) };
  }
}

// ─── Internal helpers ────────────────────────────────────────────────────────

function mergeConfig(config) {
  if (!config || config === ImmuneCheckpointConfig) return ImmuneCheckpointConfig;
  return stableClone({
    ...ImmuneCheckpointConfig,
    ...config,
    merlinEscalation: stableClone({
      ...ImmuneCheckpointConfig.merlinEscalation,
      ...(config.merlinEscalation || {}),
    }),
    ruleReputation: stableClone({
      ...ImmuneCheckpointConfig.ruleReputation,
      ...(config.ruleReputation || {}),
    }),
  });
}

function verdictForAction(action, reason) {
  if (action === 'VIOLATION') return reason === 'VACCINE_MATCH_CONFIRMED_PATHOGEN' ? 'VACCINE_MATCH' : 'CONFIRMED';
  if (action === 'HEALTH_SIGNAL') return 'REFUTED';
  if (action === 'NEEDS_MERLIN') return 'NEEDS_MERLIN';
  if (action === 'SUPPRESSED') return 'REFUTED';
  if (reason === 'INSUFFICIENT_MEMORY_SIGNAL') return 'INSUFFICIENT';
  if (reason === 'MIXED_OR_UNSTABLE_MEMORY') return 'MIXED';
  return 'INSUFFICIENT';
}

function appendHistory(history, entry) {
  const list = Array.isArray(history) ? history : [];
  const last = list[list.length - 1];
  if (last && last.runId === entry.runId && last.verdict === entry.verdict) {
    return list;
  }
  const next = list.concat([stableClone({
    runId: entry.runId,
    verdict: entry.verdict,
    evidenceHash: entry.evidenceHash,
  })]);
  if (next.length > 64) return next.slice(next.length - 64);
  return next;
}

function emitApoptosisBytecode({ ruleId, memoryCell, config }) {
  const stable = stableClone({
    ruleId: ruleId || 'rule.absent',
    observations: (memoryCell?.confirms || 0) + (memoryCell?.refutes || 0) + (memoryCell?.warnings || 0),
    refutes: memoryCell?.refutes || 0,
    localFalsePositiveRate: memoryCell?.reputation?.localFalsePositiveRate || 0,
    threshold: config.ruleReputation.refuteRatioForApoptosis,
  });
  return encodeBytecodeError(
    ERROR_CATEGORIES.STATE,
    ERROR_SEVERITY.WARN,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.IMMUNE_APOPTOSIS_SIGNAL,
    {
      layer: 'checkpoint',
      apoptosis: 'RULE_APOPTOSIS_CANDIDATE',
      ...stable,
    },
  );
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex').slice(0, 12);
}

function stableJson(value) {
  return JSON.stringify(stableClone(value));
}

function stableClone(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return Object.freeze(value.map(stableClone));
  if (Object.isFrozen(value)) return value;
  return Object.freeze(Object.fromEntries(
    Object.keys(value).sort((a, b) => a.localeCompare(b)).map((key) => [key, stableClone(value[key])]),
  ));
}

function clamp01(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(1, v));
}

function round3(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round(v * 1000) / 1000;
}

// ─── Exports for tests / advanced callers ────────────────────────────────────

export const __internals = Object.freeze({
  mergeConfig,
  verdictForAction,
  appendHistory,
  round3,
  clamp01,
  shortHash,
});

export {
  ImmuneCheckpointConfig,
  IMMUNE_CHECKPOINT_ACTIONS,
  IMMUNE_CHECKPOINT_VERDICTS,
};
