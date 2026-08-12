/**
 * FRONTIER PROCESS GATE — novel extension atom for the architectural-density control.
 *
 * Capability (one story): a valence candidate-frontier may only be treated as
 * validated after a process-sensor verdict has been read. This is not a clique
 * glue port and not a re-export of the C-sensor — it *composes* process-verdict
 * with the frontier into a gated shortlist.
 *
 * Ports (restrained, asymmetric):
 *   seeks:  process-verdict, candidate-frontier
 *   offers: gated-frontier, validation-verdict
 */

export const FRONTIER_PROCESS_GATE_CONTRACT = 'PB-FRONTIER-PROCESS-GATE-v1';
export const FRONTIER_PROCESS_GATE_SCHEMA_VERSION = '1.0.0';

/**
 * @param {{
 *   processVerdict: string,
 *   frontier: unknown[],
 * }} input
 * @returns {{
 *   contract: string,
 *   schemaVersion: string,
 *   validationVerdict: 'PASS' | 'FAIL',
 *   gatedFrontier: unknown[],
 *   reason: string | null,
 * }}
 */
export function gateFrontier(input) {
  if (!input || typeof input !== 'object') {
    throw new TypeError(`${FRONTIER_PROCESS_GATE_CONTRACT}: input must be an object`);
  }
  const { processVerdict, frontier } = input;
  if (!Array.isArray(frontier)) {
    throw new TypeError(`${FRONTIER_PROCESS_GATE_CONTRACT}: frontier must be an array`);
  }
  if (typeof processVerdict !== 'string' || !processVerdict) {
    return {
      contract: FRONTIER_PROCESS_GATE_CONTRACT,
      schemaVersion: FRONTIER_PROCESS_GATE_SCHEMA_VERSION,
      validationVerdict: 'FAIL',
      gatedFrontier: [],
      reason: 'NO_PROCESS_VERDICT',
    };
  }
  // STABLE / ABSTAIN / NO_BASELINE are observational passes; DEVIATION fails the gate.
  if (processVerdict === 'DEVIATION') {
    return {
      contract: FRONTIER_PROCESS_GATE_CONTRACT,
      schemaVersion: FRONTIER_PROCESS_GATE_SCHEMA_VERSION,
      validationVerdict: 'FAIL',
      gatedFrontier: [],
      reason: 'PROCESS_DEVIATION',
    };
  }
  const allowed = new Set(['STABLE', 'ABSTAIN', 'NO_BASELINE', 'PASS']);
  if (!allowed.has(processVerdict)) {
    return {
      contract: FRONTIER_PROCESS_GATE_CONTRACT,
      schemaVersion: FRONTIER_PROCESS_GATE_SCHEMA_VERSION,
      validationVerdict: 'FAIL',
      gatedFrontier: [],
      reason: 'UNKNOWN_PROCESS_VERDICT',
    };
  }
  return {
    contract: FRONTIER_PROCESS_GATE_CONTRACT,
    schemaVersion: FRONTIER_PROCESS_GATE_SCHEMA_VERSION,
    validationVerdict: 'PASS',
    gatedFrontier: frontier,
    reason: null,
  };
}
