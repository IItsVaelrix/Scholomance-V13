/**
 * Motif nomination — BytecodeHealth nominate-only → human SCDNA curation.
 * NEVER calls commitGene / never rewrites SCDNA.
 */

import { contentHash, deepFreeze } from './realization-equivalence/schema.js';

export const MOTIF_NOMINATION_SCHEMA = 'PB-MOTIF-NOMINATION-v1';
export const ART_MOTIF_NOMINATED = 'PB-OK-v1-ART-MOTIF-NOMINATED';

const DEFAULT_MIN_SUCCESSES = 3;

/**
 * @param {object} args
 * @param {object[]} args.evidenceRefs — manifests / equivalence / fidelity hashes
 * @param {number} [args.minSuccesses]
 * @param {object} [args.motifPayload] — description only, not gene write
 * @param {function} [args.emitHealth] — optional BytecodeHealth emitter
 * @param {function} [args.appendLedger] — optional art-memory ledger append
 */
export function nominateMotifCandidate(args = {}) {
  const evidenceRefs = args.evidenceRefs ?? [];
  const minSuccesses = args.minSuccesses ?? DEFAULT_MIN_SUCCESSES;

  const successes = evidenceRefs.filter((e) => {
    if (!e) return false;
    if (e.equivalenceClass === 'divergent') return false;
    if (e.ok === false) return false;
    return true;
  });

  if (successes.length < minSuccesses) {
    return deepFreeze({
      schema: MOTIF_NOMINATION_SCHEMA,
      nominated: false,
      reason: `insufficient-successes:${successes.length}<${minSuccesses}`,
      motifHash: null,
      healthCode: null,
    });
  }

  const motifHash = contentHash({
    payload: args.motifPayload ?? null,
    evidence: successes.map((e) => e.manifestHash || e.equivalenceHash || e.evidenceHash || e),
  });

  const nomination = deepFreeze({
    schema: MOTIF_NOMINATION_SCHEMA,
    nominated: true,
    motifHash,
    healthCode: ART_MOTIF_NOMINATED,
    evidenceRefs: Object.freeze([...successes]),
    motifPayload: Object.freeze(args.motifPayload ?? null),
    requiresHumanCuration: true,
    scdnaWrite: false,
  });

  if (typeof args.emitHealth === 'function') {
    args.emitHealth({
      code: ART_MOTIF_NOMINATED,
      severity: 'pass',
      context: { motifHash, requiresHumanCuration: true },
    });
  }

  if (typeof args.appendLedger === 'function') {
    args.appendLedger({
      type: 'motif-nomination',
      motifHash,
      healthCode: ART_MOTIF_NOMINATED,
      at: new Date().toISOString(),
    });
  }

  return nomination;
}

/**
 * Explicit guard: promotion into SCDNA is a human/compiler path, not this module.
 */
export function assertNominationDoesNotWriteScdna(nomination) {
  if (nomination?.scdnaWrite) {
    throw new Error('MOTIF_NOMINATION_ILLEGAL_SCDNA_WRITE');
  }
  return true;
}
