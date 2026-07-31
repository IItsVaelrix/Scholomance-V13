/**
 * SIMULATION MODULE 1 — Reaction → Immune Pre-Flight
 * ========================================================================
 * PB-SIM-REACTION-v1
 *
 * Takes a concept chemistry reaction, generates a spec string from it,
 * runs the spec through the innate + protocol scanners, and feeds the
 * violations into the purity assay's immune channel. Returns a preliminary
 * purity grade for the hypothetical code the reaction would produce.
 *
 * WIRING (95%): synthesize() → specFromReaction() → scanInnate() →
 *   scanProtocol() → assay({ content, filePath, ... })
 *
 * INVENTION (5%): specFromReaction() — generates a deterministic code
 *   skeleton from reaction reactants/product for scanning.
 *
 * DETERMINISM: same reaction → same spec → same scan → same checksum.
 * No randomness. No timestamps. Frozen forever.
 *
 * LABEL PRODUCED: SIMULATED — "immune pre-flight passed/failed."
 */

import { createHash } from 'node:crypto';
import { canonicalStringify } from './canonical-json.js';
import { synthesize, stabilityClass, STABLE_MIN, METASTABLE_MIN } from './concept-chemistry.js';
import { scanInnate } from '../immunity/innate.scanner.js';
import { scanProtocol } from '../immunity/protocol.scanner.js';
import { assay } from './determinism-purity-assay.js';

export const SCHEMA = 'PB-SIM-REACTION-v1';

// ─── Spec Generation (the 5% invention) ──────────────────────────────

/**
 * Generate a deterministic code skeleton from a reaction for scanning.
 * The spec is a hypothetical module that "implements" the reaction's
 * product concept. It's not real code — it's a scan target.
 *
 * @param {object} reaction - { a, b, product }
 * @returns {string} deterministic JS source skeleton
 */
export function specFromReaction(reaction) {
  const { a, b, product } = reaction;
  const safeName = (s) =>
    String(s).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'unit';

  const nameA = safeName(a);
  const nameB = safeName(b);
  const nameP = safeName(product);

  return [
    `// SPEC: ${nameP}`,
    `// Reactant A: ${a}`,
    `// Reactant B: ${b}`,
    `// Product: ${product}`,
    ``,
    `export function ${nameP}(input${nameA}, input${nameB}) {`,
    `  // Deterministic composition of reactants`,
    `  const result = Object.freeze({`,
    `    source: '${nameA}',`,
    `    target: '${nameB}',`,
    `    product: '${nameP}',`,
    `    checksum: 'spec1:placeholder',`,
    `  });`,
    `  return result;`,
    `}`,
    ``,
    `export const SCHEMA = 'PB-SPEC-${nameP.toUpperCase().slice(0, 20)}-v1';`,
  ].join('\n');
}

// ─── Checksum ────────────────────────────────────────────────────────

function simChecksum(payload) {
  const canonical = canonicalStringify(payload);
  const hash = createHash('sha256').update(canonical, 'utf8').digest('hex');
  return 'simrxn1:' + hash.slice(0, 16);
}

// ─── Main Simulation ─────────────────────────────────────────────────

/**
 * Simulate a concept chemistry reaction through the immune pre-flight.
 *
 * @param {object} opts
 * @param {string} opts.a - Reactant concept A
 * @param {string} opts.b - Reactant concept B
 * @param {string} opts.product - Product concept
 * @param {number} [opts.groundingA] - Explicit grounding for A
 * @param {number} [opts.groundingB] - Explicit grounding for B
 * @param {object} [opts.index] - GroundingIndex for corpus-derived grounding
 * @param {Set}    [opts.asyncSurface] - Async function names for protocol scanner
 * @returns {object} Frozen simulation result
 */
export function simulateReaction(opts) {
  const { a, b, product } = opts || {};
  if (!a || !b || !product) {
    throw new Error('PB-SIM-REACTION-v1: a, b, and product are required');
  }

  // Step 1: Score the reaction through concept chemistry
  const reaction = synthesize({
    a, b, product,
    groundingA: opts.groundingA,
    groundingB: opts.groundingB,
    index: opts.index,
  });

  // Step 2: Generate a spec skeleton from the reaction
  const spec = specFromReaction({ a, b, product });
  const filePath = `simulated/${product.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40)}.js`;

  // Step 3: Run innate scanner on the spec
  const innateViolations = scanInnate(spec, filePath);

  // Step 4: Run protocol scanner (needs asyncSurface)
  const protocolViolations = (opts.asyncSurface instanceof Set && opts.asyncSurface.size > 0)
    ? scanProtocol(spec, filePath, { asyncSurface: opts.asyncSurface })
    : [];

  // Step 5: Feed into the purity assay (immune channel only)
  const purityResult = assay({
    content: spec,
    filePath,
    adaptiveResult: [],
    asyncSurface: opts.asyncSurface,
  });

  // Step 6: Compose the simulation verdict
  const allViolations = [...innateViolations, ...protocolViolations];
  const immunePassed = allViolations.length === 0;
  const feasibilityPassed = reaction.feasibility >= METASTABLE_MIN;

  const verdict = !feasibilityPassed
    ? 'REJECTED_UNSTABLE'
    : immunePassed
      ? 'PRE_FLIGHT_PASS'
      : 'PRE_FLIGHT_FAIL';

  const result = {
    schema: SCHEMA,
    reaction: {
      a, b, product,
      feasibility: reaction.feasibility,
      stability: reaction.stability,
      bond: reaction.bond,
      bondSign: reaction.bondSign,
      bondMagnitude: reaction.bondMagnitude,
      grounding: reaction.grounding,
      coherence: reaction.coherence,
      lawNote: reaction.lawNote,
    },
    spec: {
      filePath,
      length: spec.length,
    },
    immune: {
      innateViolations: innateViolations.length,
      protocolViolations: protocolViolations.length,
      totalViolations: allViolations.length,
      passed: immunePassed,
      violations: allViolations.map((v) => ({
        ruleId: v.ruleId || v.pathogenId || 'UNKNOWN',
        name: v.name,
        severity: v.severity,
        category: v.category,
      })),
    },
    purity: {
      score: purityResult.score,
      grade: purityResult.grade,
    },
    verdict,
    label: {
      tier: 'SIMULATED',
      outcome: verdict === 'PRE_FLIGHT_PASS' ? 'CONFIRMED' : verdict === 'REJECTED_UNSTABLE' ? 'REFUTED' : 'CONTAMINATED',
      evidence: `immune pre-flight: ${allViolations.length} violations, purity ${purityResult.grade}`,
    },
  };

  result.checksum = simChecksum({
    a, b, product,
    feasibility: reaction.feasibility,
    violations: allViolations.length,
    purityScore: purityResult.score,
    verdict,
  });

  return Object.freeze(result);
}
