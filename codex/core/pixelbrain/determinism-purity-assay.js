/**
 * DETERMINISM PURITY ASSAY — PB-PURITY-ASSAY-v1
 * ------------------------------------------------------------------------
 * Unified determinism-purity measurement for any code chunk or file.
 *
 * Composes five independent detection channels into a single purity score
 * and grade. Each channel measures a different facet of determinism:
 *
 *   1. IMMUNE   — innate/adaptive/protocol scanner violations (called directly)
 *   2. DRIFT    — semantic checksum stability over repeated readings
 *   3. LAW      — Vaelrix Law compliance (injected from MCP law_audit)
 *   4. REPLAY   — 100-iteration identical-output verification (injected)
 *   5. STRUCTURAL — AST mutation count (injected from scd64_scan)
 *
 * DESIGN PRINCIPLES:
 *   - DETERMINISTIC: same inputs → same score → same checksum. No timestamps,
 *     no randomness, no environment entropy. Frozen forever.
 *   - COMPOSABLE: each channel is independent. Missing channels are scored
 *     as 1.0 (innocent until proven guilty) with a `notTested` flag.
 *   - INJECTABLE: MCP-tool channels (law, replay, structural) accept
 *     pre-computed results. The assay never calls MCP tools directly.
 *   - CONTENT-ADDRESSED: every result carries a `purity1:sha256[:16]` checksum.
 *
 * GRADES:
 *   PURE         ≥ 0.90  — no detectable nondeterminism
 *   TRACE        ≥ 0.70  — minor violations, structurally sound
 *   CONTAMINATED ≥ 0.40  — significant violations, needs remediation
 *   TOXIC        < 0.40  — fundamental nondeterminism, block deployment
 *
 * WEIGHTS (sum to 1.0):
 *   immune:      0.30  — pattern + semantic + protocol violations
 *   drift:       0.25  — runtime reproducibility evidence
 *   law:         0.20  — institutional law compliance
 *   replay:      0.15  — brute-force determinism proof
 *   structural:  0.10  — AST-level mutation detection
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { scanInnate } from '../immunity/innate.scanner.js';
import { scanProtocol } from '../immunity/protocol.scanner.js';
import { detectDrift } from './subtlety-drift.js';

export const SCHEMA = 'PB-PURITY-ASSAY-v1';

// ─── Grade thresholds ──────────────────────────────────────────────────────
export const GRADE_PURE = 'PURE';
export const GRADE_TRACE = 'TRACE';
export const GRADE_CONTAMINATED = 'CONTAMINATED';
export const GRADE_TOXIC = 'TOXIC';

const GRADE_THRESHOLDS = Object.freeze([
  [0.90, GRADE_PURE],
  [0.70, GRADE_TRACE],
  [0.40, GRADE_CONTAMINATED],
]);

// ─── Channel weights ───────────────────────────────────────────────────────
export const WEIGHTS = Object.freeze({
  immune: 0.30,
  drift: 0.25,
  law: 0.20,
  replay: 0.15,
  structural: 0.10,
});

// ─── Severity penalties for immune violations ──────────────────────────────
const SEVERITY_PENALTY = Object.freeze({
  FATAL: 0.40,
  CRIT: 0.25,
  WARN: 0.10,
  INFO: 0.02,
});

// ─── Law audit grade mapping ───────────────────────────────────────────────
const LAW_GRADE_SCORE = Object.freeze({
  PASS: 1.0,
  WARN: 0.70,
  FAIL: 0.20,
  FATAL: 0.0,
});

// ─── Helpers ───────────────────────────────────────────────────────────────

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

function gradeFor(score) {
  for (const [threshold, grade] of GRADE_THRESHOLDS) {
    if (score >= threshold) return grade;
  }
  return GRADE_TOXIC;
}

function purityChecksum(payload) {
  const canonical = canonicalStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'purity1:' + hash.slice(0, 16);
}

// ─── Channel scorers ───────────────────────────────────────────────────────

/**
 * CHANNEL 1: IMMUNE
 * Runs innate scanner directly (synchronous). Protocol scanner requires
 * an asyncSurface Set (injected). Adaptive scanner is async, so its results
 * are accepted as a pre-computed array (injected).
 *
 * Score = 1.0 - sum(severity penalties), clamped to [0, 1].
 *
 * @param {string} content - Raw file content
 * @param {string} filePath - Relative file path
 * @param {object} [opts]
 * @param {Array}  [opts.adaptiveResult] - Pre-computed adaptive scan violations
 * @param {Set}    [opts.asyncSurface] - Async function names for protocol scanner
 * @returns {{ score: number, violations: Array, notTested: false }}
 */
export function scoreImmune(content, filePath, opts = {}) {
  const innate = scanInnate(content, filePath);

  // Protocol scanner needs an asyncSurface Set; without it, returns []
  const protocol = (opts.asyncSurface instanceof Set && opts.asyncSurface.size > 0)
    ? scanProtocol(content, filePath, { asyncSurface: opts.asyncSurface })
    : [];

  // Adaptive scanner is async — accept pre-computed results
  const adaptive = Array.isArray(opts.adaptiveResult) ? opts.adaptiveResult : [];

  const all = [...innate, ...adaptive, ...protocol];
  let penalty = 0;
  for (const v of all) {
    const sev = String(v.severity || 'WARN').toUpperCase();
    penalty += SEVERITY_PENALTY[sev] ?? SEVERITY_PENALTY.WARN;
  }

  return {
    score: clamp01(1.0 - penalty),
    violations: all.map((v) => ({
      ruleId: v.ruleId || v.pathogenId || 'UNKNOWN',
      name: v.name,
      category: v.category,
      severity: v.severity,
      errorCode: v.errorCode,
    })),
    notTested: false,
  };
}

/**
 * CHANNEL 2: DRIFT
 * Accepts an array of SUBTLETY-FINGERPRINT-v1 readings.
 * Score = determinismScore from detectDrift().
 *
 * @param {Array} readings - Fingerprint readings for the same unit
 * @returns {{ score: number, status: string, driftRate: number, notTested: boolean }}
 */
export function scoreDrift(readings) {
  if (!Array.isArray(readings) || readings.length === 0) {
    return { score: 1.0, status: 'not-tested', driftRate: 0, notTested: true };
  }
  const result = detectDrift(readings);
  return {
    score: clamp01(result.determinismScore),
    status: result.status,
    driftRate: result.driftRate,
    divergenceAlerts: result.divergenceAlerts,
    notTested: false,
  };
}

/**
 * CHANNEL 3: LAW
 * Accepts a pre-computed law_audit result (from MCP tool).
 * Expected shape: { grade: 'PASS'|'WARN'|'FAIL'|'FATAL', violations: [...] }
 *
 * @param {object|null} lawResult - Pre-computed law audit result
 * @returns {{ score: number, grade: string, violations: Array, notTested: boolean }}
 */
export function scoreLaw(lawResult) {
  if (!lawResult || typeof lawResult !== 'object') {
    return { score: 1.0, grade: 'NOT_TESTED', violations: [], notTested: true };
  }
  const grade = String(lawResult.grade || 'PASS').toUpperCase();
  const score = LAW_GRADE_SCORE[grade] ?? 0.50;
  return {
    score: clamp01(score),
    grade,
    violations: Array.isArray(lawResult.violations) ? lawResult.violations : [],
    notTested: false,
  };
}

/**
 * CHANNEL 4: REPLAY
 * Accepts a pre-computed health_verify result (100-iteration determinism check).
 * Expected shape: { passed: boolean, iterations: number, mismatches: number }
 *
 * @param {object|null} replayResult - Pre-computed replay verification
 * @returns {{ score: number, passed: boolean, iterations: number, notTested: boolean }}
 */
export function scoreReplay(replayResult) {
  if (!replayResult || typeof replayResult !== 'object') {
    return { score: 1.0, passed: null, iterations: 0, notTested: true };
  }
  const iterations = Number(replayResult.iterations) || 100;
  const mismatches = Number(replayResult.mismatches) || 0;
  const passed = replayResult.passed === true && mismatches === 0;
  const score = passed ? 1.0 : clamp01(1.0 - (mismatches / iterations));
  return {
    score,
    passed,
    iterations,
    mismatches,
    notTested: false,
  };
}

/**
 * CHANNEL 5: STRUCTURAL
 * Accepts a pre-computed scd64_scan result (AST mutation detection).
 * Expected shape: { mutations: number, anomalies: [...] }
 *
 * @param {object|null} structuralResult - Pre-computed structural scan
 * @returns {{ score: number, mutations: number, anomalies: Array, notTested: boolean }}
 */
export function scoreStructural(structuralResult) {
  if (!structuralResult || typeof structuralResult !== 'object') {
    return { score: 1.0, mutations: 0, anomalies: [], notTested: true };
  }
  const mutations = Number(structuralResult.mutations) || 0;
  const anomalies = Array.isArray(structuralResult.anomalies) ? structuralResult.anomalies : [];
  // Each mutation costs 0.15, each anomaly costs 0.05
  const penalty = (mutations * 0.15) + (anomalies.length * 0.05);
  return {
    score: clamp01(1.0 - penalty),
    mutations,
    anomalies,
    notTested: false,
  };
}

// ─── Main assay ────────────────────────────────────────────────────────────

/**
 * Run the full Determinism Purity Assay on a code chunk or file.
 *
 * @param {object} opts
 * @param {string} opts.content - Raw source code content (required)
 * @param {string} opts.filePath - Relative file path (required)
 * @param {Array}  [opts.readings] - SUBTLETY-FINGERPRINT-v1 readings for drift channel
 * @param {Array}  [opts.adaptiveResult] - Pre-computed adaptive scanner violations
 * @param {Set}    [opts.asyncSurface] - Async function names for protocol scanner
 * @param {object} [opts.lawResult] - Pre-computed law_audit result
 * @param {object} [opts.replayResult] - Pre-computed health_verify result
 * @param {object} [opts.structuralResult] - Pre-computed scd64_scan result
 * @returns {object} Frozen assay result with score, grade, channels, checksum
 */
export function assay(opts) {
  const { content, filePath } = opts || {};
  if (typeof content !== 'string' || content.length === 0) {
    throw new Error('PB-PURITY-ASSAY-v1: content is required (non-empty string)');
  }
  if (typeof filePath !== 'string' || filePath.length === 0) {
    throw new Error('PB-PURITY-ASSAY-v1: filePath is required (non-empty string)');
  }

  // Run all five channels
  const immune = scoreImmune(content, filePath, {
    adaptiveResult: opts.adaptiveResult,
    asyncSurface: opts.asyncSurface,
  });
  const drift = scoreDrift(opts.readings);
  const law = scoreLaw(opts.lawResult);
  const replay = scoreReplay(opts.replayResult);
  const structural = scoreStructural(opts.structuralResult);

  // Compose weighted score
  const rawScore =
    (WEIGHTS.immune * immune.score) +
    (WEIGHTS.drift * drift.score) +
    (WEIGHTS.law * law.score) +
    (WEIGHTS.replay * replay.score) +
    (WEIGHTS.structural * structural.score);

  const score = clamp01(Math.round(rawScore * 10000) / 10000); // quantize to 4dp
  const grade = gradeFor(score);

  // Collect all violations across channels
  const violations = [
    ...immune.violations.map((v) => ({ channel: 'immune', ...v })),
    ...law.violations.map((v) => ({ channel: 'law', ...v })),
    ...structural.anomalies.map((v) => ({ channel: 'structural', ...v })),
  ];

  // Channels that were not tested
  const notTested = [
    drift.notTested && 'drift',
    law.notTested && 'law',
    replay.notTested && 'replay',
    structural.notTested && 'structural',
  ].filter(Boolean);

  // Build the checksummed payload (excludes notTested flags — those are
  // metadata about the assay run, not about the code's purity)
  const checksumPayload = {
    schema: SCHEMA,
    filePath,
    score,
    grade,
    channels: {
      immune: immune.score,
      drift: drift.score,
      law: law.score,
      replay: replay.score,
      structural: structural.score,
    },
  };

  const result = {
    schema: SCHEMA,
    filePath,
    score,
    grade,
    channels: {
      immune,
      drift,
      law,
      replay,
      structural,
    },
    violations,
    violationCount: violations.length,
    notTested,
    checksum: purityChecksum(checksumPayload),
  };

  return Object.freeze(result);
}

/**
 * Batch assay: run the purity assay on multiple files.
 * Returns a sorted array (most toxic first) with a batch summary.
 *
 * @param {Array<{content: string, filePath: string, readings?: Array, lawResult?: object, replayResult?: object, structuralResult?: object}>} files
 * @returns {{ results: Array, summary: { count, pure, trace, contaminated, toxic, meanScore } }}
 */
export function assayBatch(files) {
  if (!Array.isArray(files) || files.length === 0) {
    return { results: [], summary: { count: 0, pure: 0, trace: 0, contaminated: 0, toxic: 0, meanScore: 1.0 } };
  }

  const results = files.map((f) => assay(f));
  results.sort((a, b) => a.score - b.score); // most toxic first

  const summary = {
    count: results.length,
    pure: results.filter((r) => r.grade === GRADE_PURE).length,
    trace: results.filter((r) => r.grade === GRADE_TRACE).length,
    contaminated: results.filter((r) => r.grade === GRADE_CONTAMINATED).length,
    toxic: results.filter((r) => r.grade === GRADE_TOXIC).length,
    meanScore: Math.round((results.reduce((s, r) => s + r.score, 0) / results.length) * 10000) / 10000,
  };

  return Object.freeze({ results: Object.freeze(results), summary: Object.freeze(summary) });
}
