/**
 * IMMUNITY SERVICE
 *
 * Server-side orchestrator for the Scholomance Immune System.
 *
 * Wires the QBIT Immune Checkpoint v1 (PDR-2026-07-03) between the raw
 * layer scanners and the diagnostic emitter. The checkpoint is the
 * evidence governor: a rule fire is an OBSERVATION, not a violation,
 * until the checkpoint decides what to do with it.
 */

import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { scanInnate } from '../../core/immunity/innate.scanner.js';
import { scanAdaptive } from '../../core/immunity/adaptive.scanner.js';
import { scanProtocol, harvestAsyncSurface } from '../../core/immunity/protocol.scanner.js';
import { INNATE_RULES } from '../../core/immunity/innate.rules.js';
import { PATHOGEN_REGISTRY } from '../../core/immunity/pathogenRegistry.js';
import {
  checkpointDiagnosticObservation,
  persistCheckpointCell,
  updateMemoryCellWithObservation,
  createDefaultMemoryCell,
  evaluateRuleReputation,
  ImmuneCheckpointConfig,
} from '../../core/immunity/qbit-immune-checkpoint.js';
import { encodeBytecodeHealth } from '../../core/diagnostic/BytecodeHealth.js';
import { CELL_IDS, HEALTH_CODES } from '../../core/diagnostic/diagnostic-constants.js';
import {
  BytecodeError,
  decodeBytecodeError,
  ERROR_CATEGORIES,
  ERROR_CODES,
  ERROR_SEVERITY,
  MODULE_IDS,
} from '../../core/pixelbrain/bytecode-error.js';

const RULESET_VERSION = '1.1.0';
const CHECKPOINT_VERSION = ImmuneCheckpointConfig.schemaVersion;
const MAX_MEMORY_ROWS = 500;
const DAY_MS = 24 * 60 * 60 * 1000;
const PROTOCOL_PATHOGEN_ID = 'pathogen.async-protocol-drift';
const VALID_OVERRIDE_LAYERS = new Set(['innate', 'adaptive', 'protocol']);
const VALID_WORKFLOW_EVENTS = new Set(['merge', 'pr', 'refactor', 'aiCommit']);

// ─── Checkpoint buckets ────────────────────────────────────────────────────
//
// Each violation from the raw scanners is rerouted through the QBIT Immune
// Checkpoint before emission. The action the checkpoint returns determines
// which bucket the original violation lands in:
//
//   VIOLATION      → emitted as-is, with checkpointConfirmed flag
//   HEALTH_SIGNAL  → suppressed, replaced by a PB-OK-v1 green-path signal
//   WARN           → emitted with downgraded severity (not blocking)
//   NEEDS_MERLIN   → emitted, flagged for human review
//   SUPPRESSED     → suppressed (only with allowHardSuppression: true)
const CHECKPOINT_BUCKETS = Object.freeze({
  VIOLATION: 'VIOLATION',
  WARN: 'WARN',
  NEEDS_MERLIN: 'NEEDS_MERLIN',
  HEALTH_SIGNAL: 'HEALTH_SIGNAL',
  SUPPRESSED: 'SUPPRESSED',
});

const DEFAULT_CHECKPOINT_RULE_CONFIDENCE = {
  innate: 0.9,
  adaptive: 0.85,
  protocol: 0.9,
};

const DEFAULT_CHECKPOINT_EVIDENCE_COUNT = {
  innate: 3,
  adaptive: 2,
  protocol: 2,
};

function createLogger(log) {
  if (log && typeof log === 'object') {
    return {
      info: typeof log.info === 'function' ? log.info.bind(log) : () => {},
      warn: typeof log.warn === 'function' ? log.warn.bind(log) : () => {},
      error: typeof log.error === 'function' ? log.error.bind(log) : () => {},
    };
  }

  return {
    info: () => {},
    warn: () => {},
    error: () => {},
  };
}

// ─── Checkpoint adapters ────────────────────────────────────────────────────
//
// The QBIT Immune Checkpoint is a pure module that takes two DI adapters
// (memory, vaccines). This section builds sensible defaults from the
// existing INNATE_RULES + PATHOGEN_REGISTRY + a per-process Map. Production
// wiring can override via the createImmunityService({ memory, vaccines, ... })
// options.

/**
 * Default in-process memory adapter. A Map keyed by checkpoint key
 * (ruleId:path:location:bytecodeShape). Persists across scans within the
 * process lifetime; cleared on server restart.
 *
 * Counters are a per-key record of { confirms, refutes, warnings, ... }.
 */
function createDefaultMemoryAdapter() {
  const store = new Map();
  return {
    get(key) {
      return store.has(key) ? store.get(key) : null;
    },
    upsert(key, cell) {
      store.set(key, cell);
      return { ok: true, key };
    },
    size() {
      return store.size;
    },
    snapshot() {
      const out = {};
      for (const [k, v] of store.entries()) out[k] = v;
      return out;
    },
  };
}

/**
 * Default vaccines adapter. Matches against the PATHOGEN registry only.
 *
 * Per the PDR §"Integration Points" the vaccine check is for "known
 * pathogens" — confirmed disease classes registered with the adaptive
 * immune layer. Innate rules are pattern-based signals whose evidence
 * lives in the rule itself and in the QBIT memory cell, not in a vaccine.
 *
 * Matches by:
 *   1. envelope.pathogenId (the canonical adaptive scan output)
 *   2. envelope.opcode / envelope.id (pathogens that publish a stable id)
 *
 * Returns a structured verdict the checkpoint can act on.
 */
function createDefaultVaccinesAdapter(innateRules, pathogenRegistry) {
  const pathogenIndex = new Map();
  for (const pathogen of pathogenRegistry || []) {
    if (pathogen?.id) pathogenIndex.set(pathogen.id, pathogen);
  }
  // Pathogen ids derived from innate rules' repairKey fall through; we
  // intentionally do NOT match on ruleId alone. (See the comment above.)
  void innateRules;

  return {
    match(envelope) {
      if (!envelope || typeof envelope !== 'object') {
        return { matched: false };
      }
      const pathogenId = typeof envelope.pathogenId === 'string' ? envelope.pathogenId : null;

      if (pathogenId && pathogenIndex.has(pathogenId)) {
        const pathogen = pathogenIndex.get(pathogenId);
        return {
          matched: true,
          vaccineId: `PB-XP-v1-HLTH-IMMUNE-${pathogenId.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)}`,
          pathogenId,
          name: pathogen.name || pathogenId,
          source: 'pathogen-registry',
        };
      }
      // Fallback: opcode / id from the envelope (for adaptive hits that
      // emit a pathogen-like envelope).
      const opcode = envelope.opcode || envelope.id;
      if (opcode && pathogenIndex.has(opcode)) {
        const pathogen = pathogenIndex.get(opcode);
        return {
          matched: true,
          vaccineId: `PB-XP-v1-HLTH-IMMUNE-${opcode.replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 8)}`,
          pathogenId: opcode,
          name: pathogen.name || opcode,
          source: 'pathogen-opcode',
        };
      }
      return { matched: false };
    },
  };
}

/**
 * Convert a raw scanner violation into a checkpoint observation.
 *
 * Innate violations carry ruleId; adaptive violations carry pathogenId;
 * protocol violations carry ruleId + pathogenId (pathogen.async-protocol-drift).
 * We synthesize a stable bytecode envelope from the violation's own fields.
 */
function violationToObservation(violation, layer, filePath, defaultConfidence, defaultEvidence) {
  if (!violation || typeof violation !== 'object') return null;
  const ruleId = String(violation.ruleId || violation.pathogenId || '').trim() || 'rule.absent';
  const line = Number.isFinite(violation.context?.line) ? Math.trunc(violation.context.line) : null;
  const column = Number.isFinite(violation.context?.column) ? Math.trunc(violation.context.column) : null;
  const bytecodeEnvelope = {
    opcode: violation.pathogenId || violation.ruleId || 'unknown',
    layer,
    severity: violation.severity || 'WARN',
    score: Number.isFinite(violation.score) ? violation.score : null,
    threshold: Number.isFinite(violation.threshold) ? violation.threshold : null,
    // PDR §"Deterministic Memory Key" forbids timestamps + runtime key order.
    // We surface only stable diagnostic metadata in the envelope.
    ruleId: violation.ruleId || null,
    pathogenId: violation.pathogenId || null,
  };
  return {
    ruleId,
    filePath,
    location: { line, column },
    ruleConfidence: Number.isFinite(violation.ruleConfidence)
      ? Math.max(0, Math.min(1, violation.ruleConfidence))
      : defaultConfidence,
    evidenceCount: Number.isFinite(violation.evidenceCount)
      ? Math.max(0, Math.trunc(violation.evidenceCount))
      : defaultEvidence,
    bytecodeEnvelope,
    bytecodeShapeHash: `shape.${ruleId}`,
    suspectNovelAntigen: violation.suspectNovelAntigen === true,
  };
}

/**
 * Run a single violation through the checkpoint, returning a structured
 * bucket assignment plus the underlying decision.
 */
function runCheckpointForViolation({
  violation,
  layer,
  filePath,
  memory,
  vaccines,
  config,
  runIndex,
  logger,
}) {
  const defaultConfidence = DEFAULT_CHECKPOINT_RULE_CONFIDENCE[layer] || 0.7;
  const defaultEvidence = DEFAULT_CHECKPOINT_EVIDENCE_COUNT[layer] || 1;
  const observation = violationToObservation(violation, layer, filePath, defaultConfidence, defaultEvidence);
  if (!observation) {
    return { bucket: CHECKPOINT_BUCKETS.WARN, reason: 'MALFORMED_VIOLATION', decision: null };
  }
  let decision;
  try {
    decision = checkpointDiagnosticObservation({
      observation,
      memory,
      vaccines,
      config,
      runIndex,
    });
  } catch (error) {
    logger?.warn({ err: error, ruleId: observation.ruleId }, '[Immunity] Checkpoint failed; falling through to WARN.');
    return { bucket: CHECKPOINT_BUCKETS.WARN, reason: 'CHECKPOINT_THREW', decision: null };
  }

  // Persist the updated memory cell (if any). The checkpoint returns null
  // for cells when the action is VACCINE_MATCH (no memory write needed).
  if (decision.memoryCell && decision.key) {
    try {
      persistCheckpointCell(memory, decision.key, decision.memoryCell);
    } catch (error) {
      logger?.warn({ err: error, key: decision.key }, '[Immunity] Failed to persist checkpoint cell.');
    }
  }

  return {
    bucket: decision.action,
    reason: decision.reason,
    decision,
    apoptosisCandidate: decision.reputation?.candidate === true ? decision.reputation : null,
  };
}

/**
 * Convert a checkpoint decision into a PB-OK-v1 green-path health signal.
 * HEALTH_SIGNAL is "evidence-aware non-accusation" (PDR §"Emission Actions"):
 * the rule fired but memory strongly refutes it. We surface that as a
 * positive health signal so the dashboard shows the immune system is
 * learning.
 */
function emitHealthSignalForCheckpoint({
  checkpointDecision,
  violation,
  layer,
  filePath,
  runIndex,
}) {
  return encodeBytecodeHealth(
    CELL_IDS.IMMUNITY_SCAN,
    `CHECKPOINT_HEALTH_SIGNAL_${layer.toUpperCase()}`,
    {
      ruleId: violation?.ruleId || null,
      pathogenId: violation?.pathogenId || null,
      filePath,
      checkpointKey: checkpointDecision?.key || null,
      reason: checkpointDecision?.reason || 'MEMORY_REFUTES_RULE',
      verdict: checkpointDecision?.verdict || 'REFUTED',
      runIndex,
      healthCode: HEALTH_CODES.IMMUNE_PASS_COORD,
    },
  );
}

function generateId(prefix) {
  return `${prefix}-${randomUUID()}`;
}

function toIsoTimestamp(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString();
  return date.toISOString();
}

function trimMemoryRows(rows) {
  if (rows.length > MAX_MEMORY_ROWS) {
    rows.splice(0, rows.length - MAX_MEMORY_ROWS);
  }
}

function isExecutableDb(candidate) {
  return Boolean(candidate && typeof candidate.execute === 'function');
}

function normalizeRequiredString(value, field) {
  const normalized = String(value || '').trim();
  if (!normalized) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMMUNITY,
      ERROR_CODES.MISSING_REQUIRED,
      { field, service: 'immunity' },
    );
  }
  return normalized;
}

function normalizeLayer(value) {
  const normalized = normalizeRequiredString(value, 'layer');
  if (!VALID_OVERRIDE_LAYERS.has(normalized)) {
    throw new BytecodeError(
      ERROR_CATEGORIES.VALUE,
      ERROR_SEVERITY.CRIT,
      MODULE_IDS.IMMUNITY,
      ERROR_CODES.INVALID_ENUM,
      {
        field: 'layer',
        providedValue: normalized,
        allowedValues: [...VALID_OVERRIDE_LAYERS],
      },
    );
  }
  return normalized;
}

function summarizeInnateViolation(violation) {
  return {
    ruleId: violation.ruleId,
    name: violation.name,
    severity: violation.severity,
    bytecode: violation.bytecode,
    repairKey: violation.repair?.key || null,
    summary: violation.summary,
  };
}

function summarizeAdaptiveViolation(violation) {
  return {
    pathogenId: violation.pathogenId,
    name: violation.name,
    score: violation.score,
    threshold: violation.threshold,
    bytecode: violation.bytecode,
    entry: violation.entry,
    summary: violation.summary,
  };
}

function summarizeProtocolViolation(violation) {
  return {
    ruleId: violation.ruleId,
    pathogenId: PROTOCOL_PATHOGEN_ID,
    name: violation.name,
    severity: violation.severity,
    bytecode: violation.bytecode,
    context: violation.context,
    summary: violation.summary,
  };
}

function parseJsonObject(value, fallback = null) {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeScanEventRow(row) {
  const payload = parseJsonObject(row?.result_json, {});
  const timestamp = row?.timestamp || payload.timestamp || toIsoTimestamp();
  return {
    ...payload,
    id: row?.id || payload.id || generateId('scan'),
    filePath: row?.file_path || payload.filePath || '',
    timestamp,
    timestampMs: Date.parse(timestamp) || Date.now(),
    durationMs: Number(row?.duration_ms ?? payload.durationMs ?? 0),
    counts: {
      innate: Number(row?.innate_count ?? payload.counts?.innate ?? 0),
      adaptive: Number(row?.adaptive_count ?? payload.counts?.adaptive ?? 0),
      protocol: Number(row?.protocol_count ?? payload.counts?.protocol ?? 0),
      total: Number(row?.total_count ?? payload.counts?.total ?? 0),
    },
    blocked: Boolean(Number(row?.blocked ?? (payload.blocked ? 1 : 0))),
    layersRun: {
      innate: payload.layersRun?.innate !== false,
      adaptive: Boolean(payload.layersRun?.adaptive),
      protocol: Boolean(payload.layersRun?.protocol),
    },
    timingsMs: {
      innate: Number(payload.timingsMs?.innate ?? 0),
      adaptive: Number(payload.timingsMs?.adaptive ?? 0),
      protocol: Number(payload.timingsMs?.protocol ?? 0),
    },
    violations: {
      innate: Array.isArray(payload.violations?.innate) ? payload.violations.innate : [],
      adaptive: Array.isArray(payload.violations?.adaptive) ? payload.violations.adaptive : [],
      protocol: Array.isArray(payload.violations?.protocol) ? payload.violations.protocol : [],
    },
  };
}

function normalizeOverrideRow(row) {
  return {
    id: row.id,
    sha: row.sha,
    file: row.file,
    layer: row.layer,
    pathogenId: row.pathogen_id,
    reason: row.reason,
    authority: row.authority,
    timestamp: row.timestamp,
    accepter: row.accepter_agent_id,
  };
}

function buildLayerStats(events, layer) {
  const layerEvents = events.filter((event) => event.layersRun?.[layer]);
  const scans = layerEvents.length;
  const blocks = layerEvents.filter((event) => Number(event.counts?.[layer] || 0) > 0).length;
  const totalLatency = layerEvents.reduce((sum, event) => sum + Number(event.timingsMs?.[layer] || 0), 0);

  return {
    scans,
    blocks,
    avgLatencyMs: scans > 0 ? Number((totalLatency / scans).toFixed(2)) : 0,
  };
}

function buildLastBlock(events, layer) {
  const hit = [...events]
    .sort((left, right) => right.timestampMs - left.timestampMs)
    .find((event) => Number(event.counts?.[layer] || 0) > 0);

  if (!hit) return null;

  const violation = hit.violations?.[layer]?.[0] || null;
  return {
    id: hit.id,
    file: hit.filePath,
    layer,
    pathogenId: violation?.pathogenId || violation?.ruleId || null,
    severity: violation?.severity || null,
    bytecode: violation?.bytecode || null,
    timestamp: hit.timestamp,
  };
}

function buildInnateHitCounts(events) {
  const counts = new Map();
  for (const event of events) {
    for (const violation of event.violations?.innate || []) {
      const ruleId = violation.ruleId;
      if (ruleId) counts.set(ruleId, (counts.get(ruleId) || 0) + 1);
    }
  }
  return counts;
}

function buildPathogenHits(events) {
  const hits = new Map();
  for (const event of events) {
    const adaptive = event.violations?.adaptive || [];
    const protocol = event.violations?.protocol || [];
    for (const violation of [...adaptive, ...protocol]) {
      const pathogenId = violation.pathogenId;
      if (!pathogenId) continue;
      const current = hits.get(pathogenId) || { hitCount: 0, lastHitAt: null };
      current.hitCount += 1;
      if (!current.lastHitAt || Date.parse(event.timestamp) > Date.parse(current.lastHitAt)) {
        current.lastHitAt = event.timestamp;
      }
      hits.set(pathogenId, current);
    }
  }
  return hits;
}

function throwScanViolation(violation, filePath) {
  const decoded = decodeBytecodeError(violation?.bytecode);
  if (decoded?.valid) {
    throw new BytecodeError(
      decoded.category,
      decoded.severity,
      decoded.moduleId,
      decoded.errorCode,
      decoded.context,
    );
  }

  throw new BytecodeError(
    ERROR_CATEGORIES.STATE,
    ERROR_SEVERITY.CRIT,
    MODULE_IDS.IMMUNITY,
    ERROR_CODES.IMMUNE_INNATE_BLOCK,
    {
      path: filePath,
      ruleId: violation?.ruleId,
      pathogenId: violation?.pathogenId,
      reason: 'scan violation lacked decodable bytecode',
    },
  );
}

export async function createImmunityService(options = {}) {
  const { log, db, memory, vaccines, allowHardSuppression: allowHardSuppressionOption } = options;
  const logger = createLogger(log);
  const hasDb = isExecutableDb(db);
  const memoryScans = [];
  const memoryOverrides = [];
  const workflow = {
    triggeredEvents: { merge: 0, pr: 0, refactor: 0, aiCommit: 0 },
    activeAgents: [],
  };

  // Layer 3 surface cache: async function names harvested from the impl
  // modules of interest. Lazily populated by configureProtocolSurface so
  // the service stays decoupled from any specific subsystem at boot time.
  let protocolAsyncSurface = new Set();
  let protocolCallerPrefixes = [];
  let persistenceReady = false;

  async function ensurePersistence() {
    if (!hasDb || persistenceReady) return persistenceReady;
    try {
      await db.execute(`
        CREATE TABLE IF NOT EXISTS immunity_scan_events (
          id TEXT PRIMARY KEY,
          file_path TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          duration_ms REAL NOT NULL DEFAULT 0,
          innate_count INTEGER NOT NULL DEFAULT 0,
          adaptive_count INTEGER NOT NULL DEFAULT 0,
          protocol_count INTEGER NOT NULL DEFAULT 0,
          total_count INTEGER NOT NULL DEFAULT 0,
          blocked INTEGER NOT NULL DEFAULT 0,
          result_json TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_immunity_scan_events_timestamp
        ON immunity_scan_events(timestamp)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS immunity_override_audit (
          id TEXT PRIMARY KEY,
          sha TEXT NOT NULL,
          file TEXT NOT NULL,
          layer TEXT NOT NULL,
          pathogen_id TEXT NOT NULL,
          reason TEXT NOT NULL,
          authority TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          accepter_agent_id TEXT
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_immunity_override_timestamp
        ON immunity_override_audit(timestamp)
      `);
      await db.execute(`
        CREATE TABLE IF NOT EXISTS immunity_apoptosis_audit (
          id TEXT PRIMARY KEY,
          rule_id TEXT NOT NULL,
          file_path TEXT,
          observation_count INTEGER NOT NULL DEFAULT 0,
          local_false_positive_rate REAL NOT NULL DEFAULT 0,
          bytecode TEXT NOT NULL,
          timestamp TEXT NOT NULL,
          result_json TEXT NOT NULL
        )
      `);
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_immunity_apoptosis_timestamp
        ON immunity_apoptosis_audit(timestamp)
      `);
      persistenceReady = true;
    } catch (error) {
      logger.warn({ err: error }, '[Immunity] Persistence unavailable; using memory telemetry.');
      persistenceReady = false;
    }
    return persistenceReady;
  }

  async function persistScanEvent(event) {
    memoryScans.push(event);
    trimMemoryRows(memoryScans);

    if (!(await ensurePersistence())) return;
    try {
      await db.execute(`
        INSERT INTO immunity_scan_events (
          id, file_path, timestamp, duration_ms, innate_count, adaptive_count,
          protocol_count, total_count, blocked, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        event.id,
        event.filePath,
        event.timestamp,
        event.durationMs,
        event.counts.innate,
        event.counts.adaptive,
        event.counts.protocol,
        event.counts.total,
        event.blocked ? 1 : 0,
        JSON.stringify(event),
      ]);
    } catch (error) {
      logger.warn({ err: error, scanId: event.id }, '[Immunity] Failed to persist scan telemetry.');
    }
  }

  async function loadScanEventsSince(timestampMs) {
    const sinceIso = toIsoTimestamp(timestampMs);
    if (await ensurePersistence()) {
      try {
        const result = await db.execute(`
          SELECT *
          FROM immunity_scan_events
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `, [sinceIso]);
        return result.rows.map(normalizeScanEventRow);
      } catch (error) {
        logger.warn({ err: error }, '[Immunity] Failed to load persisted scan telemetry.');
      }
    }

    return memoryScans
      .filter((event) => event.timestampMs >= timestampMs)
      .sort((left, right) => right.timestampMs - left.timestampMs);
  }

  async function persistOverride(auditRow) {
    memoryOverrides.push(auditRow);
    trimMemoryRows(memoryOverrides);

    if (!(await ensurePersistence())) return;
    try {
      await db.execute(`
        INSERT INTO immunity_override_audit (
          id, sha, file, layer, pathogen_id, reason, authority, timestamp, accepter_agent_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        auditRow.id,
        auditRow.sha,
        auditRow.file,
        auditRow.layer,
        auditRow.pathogenId,
        auditRow.reason,
        auditRow.authority,
        auditRow.timestamp,
        auditRow.accepter,
      ]);
    } catch (error) {
      logger.warn({ err: error, auditId: auditRow.id }, '[Immunity] Failed to persist override audit.');
    }
  }

  async function loadOverridesSince(timestampMs) {
    const sinceIso = toIsoTimestamp(timestampMs);
    if (await ensurePersistence()) {
      try {
        const result = await db.execute(`
          SELECT *
          FROM immunity_override_audit
          WHERE timestamp >= ?
          ORDER BY timestamp DESC
        `, [sinceIso]);
        return result.rows.map(normalizeOverrideRow);
      } catch (error) {
        logger.warn({ err: error }, '[Immunity] Failed to load override audit.');
      }
    }

    return memoryOverrides
      .filter((row) => (Date.parse(row.timestamp) || 0) >= timestampMs)
      .sort((left, right) => Date.parse(right.timestamp) - Date.parse(left.timestamp));
  }

  // ─── QBIT Immune Checkpoint wiring ─────────────────────────────────────────
  //
  // The checkpoint is the evidence governor between raw scanners and
  // emission. Adapters are DI: production callers can override via the
  // `memory` and `vaccines` options to createImmunityService.
  const checkpointConfig = { ...ImmuneCheckpointConfig };
  const memoryAdapter = (options && options.memory) || createDefaultMemoryAdapter();
  const vaccinesAdapter = (options && options.vaccines) || createDefaultVaccinesAdapter(INNATE_RULES, PATHOGEN_REGISTRY);
  const allowHardSuppression = Boolean(options?.allowHardSuppression);
  const checkpointStats = {
    totalObservations: 0,
    buckets: { VIOLATION: 0, WARN: 0, NEEDS_MERLIN: 0, HEALTH_SIGNAL: 0, SUPPRESSED: 0 },
    apoptosisCandidates: 0,
    healthSignalsEmitted: 0,
  };
  const apoptosisAudit = [];

  async function persistApoptosisCandidate(candidate) {
    if (!candidate) return;
    apoptosisAudit.push(candidate);
    if (apoptosisAudit.length > MAX_MEMORY_ROWS) {
      apoptosisAudit.splice(0, apoptosisAudit.length - MAX_MEMORY_ROWS);
    }
    if (!(await ensurePersistence())) return;
    try {
      await db.execute(`
        INSERT INTO immunity_apoptosis_audit (
          id, rule_id, file_path, observation_count,
          local_false_positive_rate, bytecode, timestamp, result_json
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        candidate.id,
        candidate.ruleId,
        candidate.filePath || null,
        candidate.observationCount || 0,
        candidate.localFalsePositiveRate || 0,
        candidate.bytecode,
        candidate.timestamp,
        JSON.stringify(candidate),
      ]);
    } catch (error) {
      logger.warn({ err: error, auditId: candidate.id }, '[Immunity] Failed to persist apoptosis audit.');
    }
  }

  function recordCheckpointStats(bucket, decision) {
    checkpointStats.totalObservations += 1;
    if (Object.prototype.hasOwnProperty.call(checkpointStats.buckets, bucket)) {
      checkpointStats.buckets[bucket] += 1;
    }
    if (bucket === CHECKPOINT_BUCKETS.HEALTH_SIGNAL) {
      checkpointStats.healthSignalsEmitted += 1;
    }
    if (decision?.reputation?.candidate) {
      checkpointStats.apoptosisCandidates += 1;
    }
  }

  await ensurePersistence();

  return {
    /**
     * Configure the Layer 3 (protocol) surface. Caller passes the impl
     * modules whose async functions should be tracked, plus the identifier
     * prefixes scanFile should inspect (e.g. ['collabPersistence',
     * 'collabService']). Subsequent scanFile calls run the protocol layer.
     */
    configureProtocolSurface({ implPaths, callerPrefixes = [] } = {}) {
      const paths = Array.isArray(implPaths) ? implPaths.filter((p) => typeof p === 'string') : [];
      protocolAsyncSurface = harvestAsyncSurface(paths);
      protocolCallerPrefixes = Array.isArray(callerPrefixes)
        ? callerPrefixes.filter((prefix) => typeof prefix === 'string' && prefix.trim()).map((prefix) => prefix.trim())
        : [];
      logger.info({ size: protocolAsyncSurface.size, callerPrefixes: protocolCallerPrefixes }, '[Immunity] Protocol surface configured.');
      return { surfaceSize: protocolAsyncSurface.size };
    },

    /**
     * Executes a full multi-layer scan on a file.
     *
     * Every raw violation is rerouted through the QBIT Immune Checkpoint
     * before emission. The checkpoint's action buckets the violation:
     *
     *   VIOLATION     → emitted as-is (confirmed by memory or vaccine match)
     *   WARN          → emitted with downgraded severity
     *   NEEDS_MERLIN  → emitted, flagged for human review
     *   HEALTH_SIGNAL → suppressed; PB-OK-v1-IMMUNE-PASS-COORD emitted instead
     *   SUPPRESSED    → suppressed (only with allowHardSuppression: true)
     */
    async scanFile(content, filePath, options = {}) {
      const { runAdaptive = false, runProtocol = true, throwOnError = false } = options;
      const source = typeof content === 'string' ? content : '';
      const path = normalizeRequiredString(filePath, 'filePath');
      const startedAt = performance.now();
      const timestamp = toIsoTimestamp();
      const timingsMs = { innate: 0, adaptive: 0, protocol: 0, checkpoint: 0 };
      const layersRun = { innate: true, adaptive: false, protocol: false, checkpoint: true };

      logger.info({ filePath: path }, '[Immunity] Initiating scan.');

      const innateStartedAt = performance.now();
      const innateViolations = scanInnate(source, path);
      timingsMs.innate = Number((performance.now() - innateStartedAt).toFixed(2));

      // Heuristic: Layer 1 flags trigger Layer 2 (Adaptive)
      let adaptiveViolations = [];
      if (runAdaptive || innateViolations.length > 0) {
        layersRun.adaptive = true;
        const adaptiveStartedAt = performance.now();
        adaptiveViolations = await scanAdaptive(source);
        timingsMs.adaptive = Number((performance.now() - adaptiveStartedAt).toFixed(2));
      }

      // Layer 3 (Protocol) runs whenever a surface is configured. It is cheap
      // and structural, so default-on; callers can opt out via runProtocol.
      let protocolViolations = [];
      if (runProtocol && protocolAsyncSurface.size > 0) {
        layersRun.protocol = true;
        const protocolStartedAt = performance.now();
        protocolViolations = scanProtocol(source, path, {
          asyncSurface: protocolAsyncSurface,
          callerPrefixes: protocolCallerPrefixes,
        });
        timingsMs.protocol = Number((performance.now() - protocolStartedAt).toFixed(2));
      }

      // ─── QBIT Immune Checkpoint routing ──────────────────────────────────
      // Run a single shared runIndex per scan so every observation in this
      // file shares a logical clock tick. The checkpoint keys remain stable
      // across runs.
      const checkpointStartedAt = performance.now();
      const scanRunIndex = Date.parse(timestamp) || Date.now();
      const suppressed = [];
      const healthSignals = [];
      const apoptosisCandidatesThisScan = [];

      const routeOne = (violation, layer) => {
        const routed = runCheckpointForViolation({
          violation,
          layer,
          filePath: path,
          memory: memoryAdapter,
          vaccines: vaccinesAdapter,
          config: checkpointConfig,
          runIndex: scanRunIndex,
          logger,
        });
        recordCheckpointStats(routed.bucket, routed.decision);
        if (routed.bucket === CHECKPOINT_BUCKETS.SUPPRESSED && !allowHardSuppression) {
          // PDR §"Next risks" / default: HEALTH_SIGNAL beats SUPPRESSED.
          // Downgrade the verdict rather than hard-suppress.
          routed.bucket = CHECKPOINT_BUCKETS.HEALTH_SIGNAL;
        }
        if (routed.bucket === CHECKPOINT_BUCKETS.HEALTH_SIGNAL) {
          healthSignals.push(emitHealthSignalForCheckpoint({
            checkpointDecision: routed.decision,
            violation,
            layer,
            filePath: path,
            runIndex: scanRunIndex,
          }));
          suppressed.push({
            layer,
            ruleId: violation?.ruleId || violation?.pathogenId || null,
            reason: routed.reason,
            verdict: routed.decision?.verdict || 'REFUTED',
          });
          return null; // Suppress from the emitted buckets.
        }
        if (routed.bucket === CHECKPOINT_BUCKETS.SUPPRESSED) {
          suppressed.push({
            layer,
            ruleId: violation?.ruleId || violation?.pathogenId || null,
            reason: routed.reason,
            verdict: routed.decision?.verdict || 'REFUTED',
          });
          return null;
        }
        if (routed.apoptosisCandidate) {
          apoptosisCandidatesThisScan.push({
            id: generateId('apoptosis'),
            ruleId: routed.apoptosisCandidate.ruleId || violation?.ruleId || null,
            filePath: path,
            observationCount: routed.apoptosisCandidate.observationCount || 0,
            localFalsePositiveRate: routed.apoptosisCandidate.localFalsePositiveRate || 0,
            bytecode: routed.apoptosisCandidate.bytecode,
            timestamp,
          });
        }
        // Annotate the violation with checkpoint context so downstream
        // consumers (dashboard, scanners, audits) can see WHY it was kept.
        return {
          ...violation,
          checkpoint: {
            action: routed.bucket,
            reason: routed.reason,
            verdict: routed.decision?.verdict || null,
            checkpointKey: routed.decision?.key || null,
            reputation: routed.decision?.reputation?.candidate
              ? {
                  candidate: true,
                  localFalsePositiveRate: routed.decision.reputation.localFalsePositiveRate,
                  observationCount: routed.decision.reputation.observationCount,
                  bytecode: routed.decision.reputation.bytecode,
                }
              : { candidate: false },
          },
        };
      };

      const routedInnate = innateViolations.map(v => routeOne(v, 'innate')).filter(Boolean);
      const routedAdaptive = adaptiveViolations.map(v => routeOne(v, 'adaptive')).filter(Boolean);
      const routedProtocol = protocolViolations.map(v => routeOne(v, 'protocol')).filter(Boolean);

      timingsMs.checkpoint = Number((performance.now() - checkpointStartedAt).toFixed(2));

      // Persist any apoptosis candidates flagged during this scan.
      for (const candidate of apoptosisCandidatesThisScan) {
        // Best-effort: do not block the scan on audit persistence.
        persistApoptosisCandidate(candidate).catch((err) => {
          logger.warn({ err, auditId: candidate.id }, '[Immunity] Apoptosis audit persistence failed.');
        });
      }

      const result = {
        filePath: path,
        innate: routedInnate.map(v => ({
          ...v,
          summary: `[${v.severity}] ${v.name} (${v.ruleId}): ${v.repair.title}`,
        })),
        adaptive: routedAdaptive.map(v => ({
          ...v,
          summary: `[ADAPTIVE] ${v.name}: Similarity to known pathogen (score: ${v.score.toFixed(2)})`,
        })),
        protocol: routedProtocol.map(v => ({
          ...v,
          summary: `[PROTOCOL] ${v.name} at ${path}:${v.context.line}: missing await on ${v.context.callExpr}`,
        })),
        timestamp,
        durationMs: Number((performance.now() - startedAt).toFixed(2)),
        timingsMs,
        layersRun,
        checkpoint: {
          version: CHECKPOINT_VERSION,
          runIndex: scanRunIndex,
          buckets: { ...checkpointStats.buckets },
          suppressedCount: suppressed.length,
          healthSignalsEmitted: healthSignals.length,
          apoptosisCandidates: apoptosisCandidatesThisScan.map(c => ({
            id: c.id,
            ruleId: c.ruleId,
            observationCount: c.observationCount,
            localFalsePositiveRate: c.localFalsePositiveRate,
            bytecode: c.bytecode,
            timestamp: c.timestamp,
          })),
          suppressed,
        },
        healthSignals,
      };

      const totalCount = routedInnate.length + routedAdaptive.length + routedProtocol.length;
      result.totalViolations = totalCount;
      result.blocked = totalCount > 0;

      await persistScanEvent({
        id: generateId('scan'),
        filePath: path,
        timestamp,
        timestampMs: scanRunIndex,
        durationMs: result.durationMs,
        counts: {
          innate: routedInnate.length,
          adaptive: routedAdaptive.length,
          protocol: routedProtocol.length,
          total: totalCount,
        },
        blocked: totalCount > 0,
        layersRun,
        timingsMs,
        violations: {
          innate: result.innate.map(summarizeInnateViolation),
          adaptive: result.adaptive.map(summarizeAdaptiveViolation),
          protocol: result.protocol.map(summarizeProtocolViolation),
        },
        checkpoint: result.checkpoint,
      });

      if (throwOnError && totalCount > 0) {
        const first = routedInnate[0] || routedAdaptive[0] || routedProtocol[0];
        throwScanViolation(first, path);
      }

      return result;
    },

    /**
     * Record an explicit sovereign override. Authority validation belongs to
     * the route/auth layer; this service records the immutable audit row.
     */
    async recordOverride(input = {}) {
      const auditRow = {
        id: generateId('override'),
        sha: normalizeRequiredString(input.sha, 'sha'),
        file: normalizeRequiredString(input.file || input.filePath, 'file'),
        layer: normalizeLayer(input.layer),
        pathogenId: normalizeRequiredString(input.pathogenId || input.ruleId, 'pathogenId'),
        reason: normalizeRequiredString(input.reason, 'reason'),
        authority: normalizeRequiredString(input.authority, 'authority'),
        timestamp: toIsoTimestamp(input.timestamp),
        accepter: input.accepter || input.accepter_agent_id || null,
      };

      await persistOverride(auditRow);
      return { auditId: auditRow.id, accepted: true };
    },

    /**
     * Increment workflow counters that the dashboard consumes. This is kept
     * in-memory until the workflow event bus is wired into persistence.
     */
    recordWorkflowEvent(kind, agent = null) {
      if (!VALID_WORKFLOW_EVENTS.has(kind)) {
        throw new BytecodeError(
          ERROR_CATEGORIES.VALUE,
          ERROR_SEVERITY.CRIT,
          MODULE_IDS.IMMUNITY,
          ERROR_CODES.INVALID_ENUM,
          {
            field: 'kind',
            providedValue: kind,
            allowedValues: [...VALID_WORKFLOW_EVENTS],
          },
        );
      }

      workflow.triggeredEvents[kind] += 1;
      if (agent?.id) {
        const existing = workflow.activeAgents.find((entry) => entry.id === agent.id);
        if (existing) {
          existing.commitsLast7d = Number(agent.commitsLast7d ?? existing.commitsLast7d ?? 0);
          existing.pathogensIntroduced = Number(agent.pathogensIntroduced ?? existing.pathogensIntroduced ?? 0);
        } else {
          workflow.activeAgents.push({
            id: String(agent.id),
            commitsLast7d: Number(agent.commitsLast7d || 0),
            pathogensIntroduced: Number(agent.pathogensIntroduced || 0),
          });
        }
      }

      return { triggeredEvents: { ...workflow.triggeredEvents } };
    },

    /**
     * Retrieves the global status of the immune system.
     */
    async getStatus() {
      const now = Date.now();
      const events24h = await loadScanEventsSince(now - DAY_MS);
      const overrides30d = await loadOverridesSince(now - (30 * DAY_MS));
      const innateHits = buildInnateHitCounts(events24h);
      const pathogenHits = buildPathogenHits(events24h);
      const adaptivePathogens = PATHOGEN_REGISTRY.filter((pathogen) => pathogen.layer !== 'protocol');
      const protocolPathogen = PATHOGEN_REGISTRY.find((pathogen) => pathogen.id === PROTOCOL_PATHOGEN_ID);

      return {
        innate: {
          enabled: true,
          rulesetVersion: RULESET_VERSION,
          rules: INNATE_RULES.map((r) => ({
            id: r.id,
            name: r.name,
            pattern: r.id,
            hitCount: innateHits.get(r.id) || 0,
            category: r.category,
            errorCode: r.errorCode,
            severity: r.severity,
            repairKey: r.repairKey,
          })),
          last24h: buildLayerStats(events24h, 'innate'),
          lastBlock: buildLastBlock(events24h, 'innate'),
        },
        adaptive: {
          enabled: true,
          pathogenCount: adaptivePathogens.length,
          pathogens: adaptivePathogens.map((pathogen) => {
            const hit = pathogenHits.get(pathogen.id) || { hitCount: 0, lastHitAt: null };
            return {
              id: pathogen.id,
              name: pathogen.name,
              threshold: pathogen.threshold,
              hitCount: hit.hitCount,
              lastHitAt: hit.lastHitAt,
              encyclopediaEntry: pathogen.encyclopediaEntry,
            };
          }),
          last24h: buildLayerStats(events24h, 'adaptive'),
        },
        protocol: {
          enabled: protocolAsyncSurface.size > 0,
          surfaceSize: protocolAsyncSurface.size,
          callerPrefixes: protocolCallerPrefixes,
          pathogen: protocolPathogen
            ? {
                id: protocolPathogen.id,
                name: protocolPathogen.name,
                encyclopediaEntry: protocolPathogen.encyclopediaEntry,
                hitCount: pathogenHits.get(PROTOCOL_PATHOGEN_ID)?.hitCount || 0,
                lastHitAt: pathogenHits.get(PROTOCOL_PATHOGEN_ID)?.lastHitAt || null,
              }
            : null,
          last24h: buildLayerStats(events24h, 'protocol'),
        },
        checkpoint: {
          version: CHECKPOINT_VERSION,
          totalObservations: checkpointStats.totalObservations,
          buckets: { ...checkpointStats.buckets },
          healthSignalsEmitted: checkpointStats.healthSignalsEmitted,
          apoptosisCandidates: checkpointStats.apoptosisCandidates,
          allowHardSuppression,
          memorySize: typeof memoryAdapter.size === 'function' ? memoryAdapter.size() : null,
          recentApoptosis: apoptosisAudit.slice(-10).map((entry) => ({
            id: entry.id,
            ruleId: entry.ruleId,
            observationCount: entry.observationCount,
            localFalsePositiveRate: entry.localFalsePositiveRate,
            bytecode: entry.bytecode,
            timestamp: entry.timestamp,
          })),
        },
        override: {
          last30d: overrides30d,
        },
        workflow: {
          triggeredEvents: { ...workflow.triggeredEvents },
          activeAgents: workflow.activeAgents.map((agent) => ({ ...agent })),
        },
      };
    },
  };
}
