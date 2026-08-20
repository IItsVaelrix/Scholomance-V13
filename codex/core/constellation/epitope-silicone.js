/**
 * EPITOPE → SILICONE PROPOSALS
 *
 * Capability markers name a call. This module asks what construction that
 * call would be if we authored it as approximation-status chemistry.
 *
 * LAW: assembly is not authorship. A proposal is silicone by status
 * (approximation) even when its reaction is carbon-shaped (new phrase type).
 * `shape` reports the reaction geometry. The Cyclotron may not stamp
 * `status: grammar`.
 *
 * Does not consult the live BONDS table. Projection physics only.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/epitope-silicone
 */

import { BOND_REACTION, classifyBond } from './bond-kind.js';
import { ELEMENT_PHASE, classifyConstruction } from './element-phase.js';
import { CONSTRUCTION_STATUS } from './grimoire/schemas.js';
import { deriveBond } from './grimoire/projection-laws.js';
import { SEEKING } from './unknown-capability-marker.js';

/**
 * What a seeking caller wants on the facing side.
 * Lexical stand-in for a hole (phrase types lift from these).
 */
export const CALL_COMPLEMENT = Object.freeze({
  DET: Object.freeze({ type: 'N', pos: 'n' }),
  P: Object.freeze({ type: 'N', pos: 'n' }),
  V: Object.freeze({ type: 'N', pos: 'n' }),
  AUX: Object.freeze({ type: 'VP', pos: 'v' }),
  MODAL: Object.freeze({ type: 'VP', pos: 'v' }),
  COP: Object.freeze({ type: 'ADJ', pos: 'a' }),
  SUB: Object.freeze({ type: 'S', pos: 'v' }),
  TO: Object.freeze({ type: 'VP', pos: 'v' }),
  POSS: Object.freeze({ type: 'N', pos: 'n' }),
});

export function hypothesizeComplement(callerType) {
  return CALL_COMPLEMENT[callerType] || null;
}

function orderedTypes(callerType, callerFrom, partnerType, partnerFrom) {
  if (callerFrom <= partnerFrom) return [callerType, partnerType];
  return [partnerType, callerType];
}

function asConstruction(left, right, result, head, operation) {
  const bond = [left, right, result, head];
  const reaction = classifyBond(bond);
  const status = CONSTRUCTION_STATUS.APPROXIMATION;
  const construction = {
    id: `epitope-${left}-${right}-${result}`.toLowerCase(),
    family: 'unknown-capability',
    left,
    right,
    result,
    head,
    status,
    operation: operation || null,
    limitation: 'epitope-authored approximation; not Grimoire law',
  };
  const phase = classifyConstruction(construction);
  const shape = reaction === BOND_REACTION.CONSTRUCTIVE ? 'carbon-shaped' : 'silicone-shaped';
  return Object.freeze({
    ...construction,
    reaction,
    shape,
    phase,
    signature: `${left}|${right}|${result}`,
  });
}

function preserveHost(callerType, callerFrom, unknownType, unknownFrom) {
  const hostIsCaller = Boolean(callerType);
  const hostType = hostIsCaller ? callerType : unknownType;
  const adjunctType = hostIsCaller ? unknownType : callerType;
  if (!hostType || !adjunctType) return null;
  const [left, right] = orderedTypes(callerType, callerFrom, unknownType, unknownFrom);
  const head = left === hostType ? 0 : 1;
  return asConstruction(left, right, hostType, head, 'modify');
}

/**
 * Propose chemistry from a known call and an unknown (typed or typeless).
 * Returns null when nothing seeks.
 */
export function proposeFromCall({
  callerType, callerFrom, unknownType = null, unknownFrom,
} = {}) {
  const callerSeeks = Boolean(SEEKING[callerType]);
  const unknownSeeks = Boolean(unknownType && SEEKING[unknownType]);
  if (!callerSeeks && !unknownSeeks) return null;

  let partnerType = unknownType;
  if (!partnerType && callerSeeks) {
    const hyp = hypothesizeComplement(callerType);
    if (!hyp) return null;
    partnerType = hyp.type;
  }
  if (!partnerType) return null;

  const [left, right] = orderedTypes(callerType, callerFrom, partnerType, unknownFrom);
  const derived = deriveBond(left, right);
  if (derived) {
    return asConstruction(derived.left, derived.right, derived.result, derived.head, derived.operation);
  }
  if (unknownType && unknownSeeks && callerType) {
    return preserveHost(callerType, callerFrom, unknownType, unknownFrom);
  }
  if (unknownType && callerSeeks) {
    return preserveHost(callerType, callerFrom, unknownType, unknownFrom);
  }
  return null;
}

export function phaseOfProposal(proposal) {
  return proposal?.phase || ELEMENT_PHASE.INERT;
}

export function isSiliconeShaped(proposal) {
  return proposal?.shape === 'silicone-shaped';
}

/**
 * Frozen after the 2026-08-15 gate assay. Do not edit after seeing
 * held-out results. These are provisional silicone, not Grimoire law.
 *
 * Minted on treebank-gate (EWT-dev stride 3). Held-out must be a
 * disjoint split (EWT-test).
 */
export const FROZEN_EPITOPE_SILICONE = Object.freeze({
  contract: 'PB-FROZEN-EPITOPE-SILICONE-v1',
  minted: 'docs/superpowers/evidence/2026-08-15-epitope-silicone.json',
  mintedCorpus: 'treebank-gate (EWT-dev stride-3, maxTokens 20)',
  bonds: Object.freeze([
    Object.freeze(['V', 'P', 'V', 0]),
    Object.freeze(['N', 'P', 'N', 0]),
    Object.freeze(['ADV', 'MODAL', 'ADV', 0]),
    Object.freeze(['V', 'DET', 'V', 0]),
    Object.freeze(['TO', 'DET', 'TO', 0]),
    Object.freeze(['DET', 'ADV', 'DET', 0]),
    Object.freeze(['DET', 'V', 'DET', 0]),
    Object.freeze(['AUX', 'ADJ', 'ADJ', 1]),
  ]),
});

export function signatureOfBond(bond) {
  return `${bond[0]}|${bond[1]}|${bond[2]}`;
}

/**
 * Matched placebo: same count, same left-type multiset, same preserve-left
 * vs preserve-right split. Rights are deranged so no treatment pair repeats.
 */
export function matchedPlaceboSilicone(frozenBonds, seed) {
  const source = frozenBonds || FROZEN_EPITOPE_SILICONE.bonds;
  const rights = source.map((b) => b[1]);
  let s = seed >>> 0;
  const rnd = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const original = new Set(source.map(signatureOfBond));
  for (let attempt = 0; attempt < 64; attempt += 1) {
    for (let i = rights.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rnd() * (i + 1));
      [rights[i], rights[j]] = [rights[j], rights[i]];
    }
    const out = source.map((b, i) => {
      const left = b[0];
      const right = rights[i];
      const preserveLeft = b[2] === b[0];
      const result = preserveLeft ? left : right;
      const head = preserveLeft ? 0 : 1;
      return Object.freeze([left, right, result, head]);
    });
    const sigs = out.map(signatureOfBond);
    if (new Set(sigs).size !== out.length) continue;
    if (sigs.some((sig) => original.has(sig))) continue;
    return Object.freeze(out);
  }
  throw new Error('placebo could not avoid treatment signatures');
}
