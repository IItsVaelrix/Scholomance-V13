/**
 * SIMULATION MODULE 2 — Intent → Law Gate
 * ========================================================================
 * PB-SIM-LAWGATE-v1
 *
 * Takes a proposed change description (intent string), runs it through
 * the law gate from concept chemistry, and maps the result into the
 * purity assay's law channel. Returns a law compliance verdict.
 *
 * WIRING (90%): lawGate(product) → scoreLaw({ grade }) → assay law channel
 *
 * INVENTION (10%): intentToProduct() — extracts the "product concept"
 *   from a free-form intent string for law gate consumption.
 *
 * DETERMINISM: same intent → same product extraction → same law gate →
 *   same checksum. No randomness. No timestamps. Frozen forever.
 *
 * LABEL PRODUCED: SIMULATED — "law gate passed/failed for this intent."
 *
 * NOTE: The MCP law_audit tool accepts { intent } instead of { file_path }
 * for pre-emptive audits. This module provides a synchronous, in-process
 * equivalent using the concept chemistry law gate. For full MCP law_audit
 * with file-level analysis, inject the result via assay({ lawResult }).
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { lawGate, stabilityClass } from './concept-chemistry.js';
import { scoreLaw } from './determinism-purity-assay.js';

export const SCHEMA = 'PB-SIM-LAWGATE-v1';

// ─── Intent Extraction (the 10% invention) ───────────────────────────

/**
 * Extract a "product concept" from a free-form intent string.
 * The law gate operates on token sets, so we normalize the intent
 * into a concept string that captures the key nouns and verbs.
 *
 * @param {string} intent - Free-form change description
 * @returns {string} normalized product concept for law gate
 */
export function intentToProduct(intent) {
  const text = String(intent || '').toLowerCase();

  // Strip common filler words that don't carry law-relevant signal
  const filler = new Set([
    'i', 'want', 'to', 'the', 'a', 'an', 'is', 'are', 'was', 'were',
    'will', 'would', 'could', 'should', 'can', 'may', 'might', 'shall',
    'we', 'our', 'you', 'your', 'it', 'its', 'they', 'them', 'this',
    'that', 'these', 'those', 'please', 'need', 'like', 'just', 'also',
    'create', 'build', 'make', 'add', 'implement', 'write', 'generate',
    'fix', 'update', 'change', 'modify', 'improve', 'refactor',
  ]);

  const tokens = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !filler.has(w));

  return tokens.join(' ') || 'unspecified change';
}

// ─── Law Grade Mapping ───────────────────────────────────────────────

/**
 * Map a law gate result to an assay-compatible law grade.
 * lawGate returns scale ∈ {0, 0.7, 1.0} with a note.
 * scoreLaw expects { grade: 'PASS'|'WARN'|'FAIL'|'FATAL' }.
 *
 * @param {{scale: number, note: string}} gateResult
 * @returns {{grade: string, violations: Array}}
 */
export function gateToLawResult(gateResult) {
  if (gateResult.scale === 0) {
    return {
      grade: 'FATAL',
      violations: [{ rule: 'DETERMINISM_LAW', note: gateResult.note, severity: 'FATAL' }],
    };
  }
  if (gateResult.scale >= 1.0) {
    return { grade: 'PASS', violations: [] };
  }
  // scale === 0.7 → LAW_NEUTRAL → WARN
  return {
    grade: 'WARN',
    violations: [{ rule: 'LAW_NEUTRAL', note: gateResult.note, severity: 'WARN' }],
  };
}

// ─── Checksum ────────────────────────────────────────────────────────

function simChecksum(payload) {
  const canonical = canonicalStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'simlaw1:' + hash.slice(0, 16);
}

// ─── Main Simulation ─────────────────────────────────────────────────

/**
 * Simulate a law gate check on a proposed change intent.
 *
 * @param {object} opts
 * @param {string} opts.intent - Free-form change description (required)
 * @returns {object} Frozen simulation result
 */
export function simulateLawGate(opts) {
  const { intent } = opts || {};
  if (typeof intent !== 'string' || intent.trim().length === 0) {
    throw new Error('PB-SIM-LAWGATE-v1: intent is required (non-empty string)');
  }

  // Step 1: Extract product concept from intent
  const product = intentToProduct(intent);

  // Step 2: Run through the law gate
  const gate = lawGate(product);

  // Step 3: Map to assay-compatible law result
  const lawResult = gateToLawResult(gate);

  // Step 4: Score through the assay's law channel
  const lawScore = scoreLaw(lawResult);

  // Step 5: Compose verdict
  const verdict = gate.scale === 0
    ? 'LAW_VIOLATION'
    : gate.scale >= 1.0
      ? 'LAW_ALIGNED'
      : 'LAW_NEUTRAL';

  const result = {
    schema: SCHEMA,
    intent: intent.trim(),
    product,
    gate: {
      scale: gate.scale,
      note: gate.note,
    },
    lawChannel: {
      score: lawScore.score,
      grade: lawScore.grade,
      violations: lawScore.violations,
      notTested: lawScore.notTested,
    },
    verdict,
    label: {
      tier: 'SIMULATED',
      outcome: verdict === 'LAW_VIOLATION' ? 'REFUTED' : verdict === 'LAW_ALIGNED' ? 'CONFIRMED' : 'METASTABLE',
      evidence: `law gate: ${gate.note}, score ${lawScore.score}`,
    },
  };

  result.checksum = simChecksum({
    intent: intent.trim(),
    product,
    scale: gate.scale,
    note: gate.note,
    verdict,
  });

  return Object.freeze(result);
}
