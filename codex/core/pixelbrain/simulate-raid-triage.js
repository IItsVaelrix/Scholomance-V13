/**
 * SIMULATION MODULE 3 — Spec → RAID Triage
 * ========================================================================
 * PB-SIM-RAID-v1
 *
 * Takes a feature spec, extracts hypothetical failure symptoms from it,
 * and runs them through Clerical RAID. If CONFIRMED against a known
 * pathogen, the feature is in a known-risky area. If NOVEL, it's
 * uncharted territory. If DENIED, it's likely safe.
 *
 * WIRING (85%): specToSymptoms() → createRaidWithSeeds() → raid.query()
 *
 * INVENTION (15%): specToSymptoms() — template-based extraction of
 *   hypothetical error messages from a feature description.
 *
 * DETERMINISM: same spec → same symptoms → same RAID query → same
 *   checksum. RAID uses a fixed seed (42) and deterministic vectorization.
 *
 * LABEL PRODUCED: SIMULATED — "RAID triage: CONFIRMED risk / NOVEL / DENIED."
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { createRaidWithSeeds } from '../immunity/clerical-raid.bootstrap.js';

export const SCHEMA = 'PB-SIM-RAID-v1';

// ─── Symptom Extraction (the 15% invention) ──────────────────────────

/**
 * Risk-area keyword → hypothetical symptom templates.
 * When a spec mentions a risk area, we generate the error messages
 * that would appear if that area broke. These are fed to RAID.
 */
const RISK_TEMPLATES = Object.freeze([
  {
    keywords: ['random', 'rng', 'seed', 'stochastic', 'nondetermin'],
    symptoms: [
      'unseeded Math.random in combat logic',
      'nondeterministic output across runs',
      'RNG state not reset between tests',
    ],
  },
  {
    keywords: ['async', 'await', 'promise', 'callback', 'concurrent'],
    symptoms: [
      'unhandled promise rejection',
      'async function called without await',
      'race condition in concurrent access',
    ],
  },
  {
    keywords: ['render', 'draw', 'canvas', 'sprite', 'shader', 'pixel'],
    symptoms: [
      'render output differs between frames',
      'shader compilation failure',
      'sprite atlas mismatch',
    ],
  },
  {
    keywords: ['state', 'store', 'mutation', 'immutable', 'freeze'],
    symptoms: [
      'state mutation detected in frozen object',
      'unexpected state change between renders',
      'store not properly isolated',
    ],
  },
  {
    keywords: ['import', 'module', 'dependency', 'circular', 'boundary'],
    symptoms: [
      'circular dependency detected',
      'layer boundary violation',
      'render-adjacent import in core layer',
    ],
  },
  {
    keywords: ['checksum', 'hash', 'integrity', 'seal', 'verify'],
    symptoms: [
      'checksum mismatch after serialization',
      'seal verification failed',
      'content hash differs from expected',
    ],
  },
  {
    keywords: ['memory', 'leak', 'cache', 'buffer', 'overflow'],
    symptoms: [
      'memory leak detected in long-running process',
      'cache not invalidated after update',
      'buffer overflow in packet encoding',
    ],
  },
  {
    keywords: ['network', 'socket', 'websocket', 'http', 'api', 'fetch'],
    symptoms: [
      'websocket connection dropped unexpectedly',
      'API response timeout',
      'network packet loss causing state desync',
    ],
  },
]);

/**
 * Extract hypothetical failure symptoms from a feature spec.
 *
 * @param {string} spec - Feature description text
 * @returns {{ symptoms: string[], filePaths: string[], matchedAreas: string[] }}
 */
export function specToSymptoms(spec) {
  const text = String(spec || '').toLowerCase();
  const symptoms = [];
  const matchedAreas = [];

  for (const template of RISK_TEMPLATES) {
    const hits = template.keywords.filter((kw) => text.includes(kw));
    if (hits.length > 0) {
      matchedAreas.push(...hits);
      symptoms.push(...template.symptoms);
    }
  }

  // Always include a generic symptom so RAID has something to chew on
  if (symptoms.length === 0) {
    symptoms.push('unclassified feature change with unknown risk profile');
  }

  // Extract file paths if mentioned
  const filePaths = [];
  const pathPattern = /(?:[\w-]+\/)+[\w-]+\.\w+/g;
  const pathMatch = text.match(pathPattern);
  if (pathMatch) filePaths.push(...pathMatch);

  return {
    symptoms: [...new Set(symptoms)],
    filePaths: [...new Set(filePaths)],
    matchedAreas: [...new Set(matchedAreas)],
  };
}

// ─── Checksum ────────────────────────────────────────────────────────

function simChecksum(payload) {
  const canonical = canonicalStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'simraid1:' + hash.slice(0, 16);
}

// ─── Main Simulation ─────────────────────────────────────────────────

/**
 * Simulate a RAID triage on a feature spec.
 *
 * @param {object} opts
 * @param {string} opts.spec - Feature description (required)
 * @param {object} [opts.raid] - Pre-built ClericalRAID instance (optional)
 * @returns {object} Frozen simulation result
 */
export function simulateRaidTriage(opts) {
  const { spec } = opts || {};
  if (typeof spec !== 'string' || spec.trim().length === 0) {
    throw new Error('PB-SIM-RAID-v1: spec is required (non-empty string)');
  }

  // Step 1: Extract hypothetical symptoms
  const { symptoms, filePaths, matchedAreas } = specToSymptoms(spec);

  // Step 2: Build or reuse RAID instance
  const raid = opts.raid || createRaidWithSeeds();

  // Step 3: Query RAID
  const raidResult = raid.query({ symptoms, filePaths });

  // Step 4: Compose verdict
  const verdict = raidResult.verdict; // CONFIRMED | DENIED | NEEDS_MERLIN | NOVEL

  const riskLevel = verdict === 'CONFIRMED'
    ? 'KNOWN_RISK'
    : verdict === 'NOVEL'
      ? 'UNCHARTED'
      : verdict === 'NEEDS_MERLIN'
        ? 'AMBIGUOUS'
        : 'LIKELY_SAFE';

  const result = {
    schema: SCHEMA,
    spec: spec.trim().slice(0, 200),
    symptoms: {
      extracted: symptoms,
      count: symptoms.length,
      matchedAreas,
      filePaths,
    },
    raid: {
      verdict,
      confidence: raidResult.confidence,
      margin: raidResult.margin,
      matchedPattern: raidResult.matchedPattern
        ? { id: raidResult.matchedPattern.id, name: raidResult.matchedPattern.name }
        : null,
      fixPath: raidResult.fixPath || null,
      owner: raidResult.owner,
      escalationRequired: raidResult.escalationRequired,
      neighbors: (raidResult.neighbors || []).slice(0, 3).map((n) => ({
        patternId: n.patternId,
        pattern: n.pattern,
        similarity: Math.round(n.similarity * 1e4) / 1e4,
      })),
    },
    riskLevel,
    label: {
      tier: 'SIMULATED',
      outcome: verdict === 'CONFIRMED' ? 'REFUTED' : verdict === 'NOVEL' ? 'NOVEL' : 'METASTABLE',
      evidence: `RAID triage: ${verdict} (confidence ${Math.round(raidResult.confidence * 1e4) / 1e4}, ${symptoms.length} symptoms)`,
    },
  };

  result.checksum = simChecksum({
    spec: spec.trim().slice(0, 200),
    symptoms: symptoms.length,
    verdict,
    confidence: Math.round(raidResult.confidence * 1e4) / 1e4,
  });

  return Object.freeze(result);
}
