/**
 * ELEMENT PHASE — silicone (flexible rule) vs carbon (axiom).
 *
 * Silicone is apt for grammatical/semantic *process*: it bends, preserves,
 * approximates. Carbon is apt for grammatical *foundation*: a new phrase
 * type appears and the Grimoire claims it as law.
 *
 * LAW: assembly is not authorship. A molecule of silicone atoms is a
 * transmutation only when the lattice assay says the product is carbon and
 * no carbon atom was carried in. The Cyclotron may reveal a daughter that
 * was already axiom-shaped. It may not stamp Grimoire status.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/element-phase
 */

import { BOND_REACTION, classifyBond } from './bond-kind.js';
import { CONSTRUCTION_STATUS, toBond } from './grimoire/schemas.js';
import { validateBonds } from './compose.js';

export const ELEMENT_PHASE = Object.freeze({
  SILICONE: 'silicone',
  CARBON: 'carbon',
  INERT: 'inert',
});

/** Phrase types that can hold a clause/nominal lattice. */
export const PHRASE_TYPES = Object.freeze(new Set([
  'NP', 'VP', 'S', 'PP', 'INF', 'SBAR',
]));

function bondOf(construction) {
  return [construction.left, construction.right, construction.result, construction.head];
}

export function classifyConstruction(construction) {
  if (!construction || construction.status === CONSTRUCTION_STATUS.DEPRECATED) {
    return ELEMENT_PHASE.INERT;
  }
  const kind = classifyBond(bondOf(construction));
  const constructivePhrase = kind === BOND_REACTION.CONSTRUCTIVE
    && PHRASE_TYPES.has(construction.result);
  if (construction.status === CONSTRUCTION_STATUS.GRAMMAR && constructivePhrase) {
    return ELEMENT_PHASE.CARBON;
  }
  if (
    construction.status === CONSTRUCTION_STATUS.SCAFFOLD
    || construction.status === CONSTRUCTION_STATUS.APPROXIMATION
    || kind === BOND_REACTION.PRESERVATIVE
    || kind === BOND_REACTION.RECURSIVE_PRESERVATIVE
  ) {
    return ELEMENT_PHASE.SILICONE;
  }
  return ELEMENT_PHASE.INERT;
}

/**
 * A set of constructions is a carbon lattice when it creates a phrase type
 * constructively, every member has a declared head, and nothing is deprecated.
 */
export function axiomAssay(constructions) {
  const list = Array.isArray(constructions) ? constructions.filter(Boolean) : [];
  const phraseResults = [];
  const reasons = [];
  if (list.length === 0) {
    return { ok: false, phraseResults, reasons: ['empty'] };
  }
  for (const c of list) {
    if (c.status === CONSTRUCTION_STATUS.DEPRECATED) reasons.push(`deprecated:${c.id}`);
    if (c.head !== 0 && c.head !== 1) reasons.push(`headless:${c.id}`);
    const kind = classifyBond(bondOf(c));
    if (kind === BOND_REACTION.CONSTRUCTIVE && PHRASE_TYPES.has(c.result)) {
      phraseResults.push(c.result);
    }
  }
  if (phraseResults.length === 0) reasons.push('no-constructive-phrase');
  return {
    ok: reasons.length === 0 && phraseResults.length > 0,
    phraseResults: [...new Set(phraseResults)].sort(),
    reasons,
  };
}

/**
 * Transmutation requires an all-silicone input set whose lattice is carbon.
 * A single carbon constituent is contamination, not a phase change.
 */
export function transmutationVerdict(constructions) {
  const list = Array.isArray(constructions) ? constructions.filter(Boolean) : [];
  if (list.length === 0) {
    return { transmuted: false, reason: 'empty', assay: axiomAssay(list) };
  }
  const phases = list.map((c) => classifyConstruction(c));
  if (phases.some((p) => p === ELEMENT_PHASE.INERT)) {
    return { transmuted: false, reason: 'inert-contaminated', assay: axiomAssay(list) };
  }
  if (phases.some((p) => p === ELEMENT_PHASE.CARBON)) {
    return { transmuted: false, reason: 'carbon-contaminated', assay: axiomAssay(list) };
  }
  if (phases.some((p) => p !== ELEMENT_PHASE.SILICONE)) {
    return { transmuted: false, reason: 'not-all-silicone', assay: axiomAssay(list) };
  }
  const assay = axiomAssay(list);
  if (!assay.ok) {
    return { transmuted: false, reason: assay.reasons[0] || 'assay-failed', assay };
  }
  return { transmuted: true, reason: 'silicone-lattice-is-carbon', assay };
}

function atomId(construction) {
  const raw = String(construction.id || `${construction.left}-${construction.right}-${construction.result}`);
  const id = raw.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  return id.slice(0, 64) || 'construction';
}

/**
 * Project a construction as a cyclotron atom.
 *
 * Ports are INPUT categories only. The result type is never offered — offering
 * it would smuggle the axiom into the bank and make "transmutation" a lookup.
 */
export function constructionToAtom(construction) {
  const phase = classifyConstruction(construction);
  const left = String(construction.left).toLowerCase();
  const right = String(construction.right).toLowerCase();
  return {
    id: atomId(construction),
    label: String(construction.note || construction.id || 'construction').slice(0, 160),
    domain: String(construction.family || 'linguistic').toLowerCase().replace(/[^a-z0-9-]+/g, '-'),
    offers: [`cat-${left}`],
    seeks: [`cat-${right}`],
    traits: [phase, construction.status, classifyBond(bondOf(construction))],
    inhibits: [],
    evidence: [`grimoire:${construction.id}`],
    grounding: phase === ELEMENT_PHASE.CARBON
      ? 0.80
      : phase === ELEMENT_PHASE.SILICONE
        ? 0.55
        : 0.20,
    construction: {
      id: construction.id,
      left: construction.left,
      right: construction.right,
      result: construction.result,
      head: construction.head,
      status: construction.status,
      family: construction.family,
      phase,
    },
  };
}

/**
 * Stamp `status: grammar`. The chart does not read status. The classifier does.
 * Preservative silicone stays silicone after this stamp — preservation is not
 * an axiom, and a label cannot make it one.
 */
export function asCarbonAxiom(construction) {
  if (!construction || construction.status === CONSTRUCTION_STATUS.DEPRECATED) {
    return construction;
  }
  return { ...construction, status: CONSTRUCTION_STATUS.GRAMMAR };
}

export function becomesCarbonAxiom(construction) {
  return classifyConstruction(construction) !== ELEMENT_PHASE.CARBON
    && classifyConstruction(asCarbonAxiom(construction)) === ELEMENT_PHASE.CARBON;
}

export function graduationQueue(constructions) {
  return (constructions || []).filter(becomesCarbonAxiom);
}

function signatureOf(bond) {
  return `${bond[0]}|${bond[1]}|${bond[2]}`;
}

function bondsFrom(constructions) {
  const bonds = constructions.map(toBond);
  validateBonds(bonds);
  return Object.freeze(bonds);
}

/**
 * Sandboxed Grimoire feeds. FULL is today's active table. GRADUATED is carbon
 * plus the queue, as if those daughters had been promoted. OVERFEED appends
 * extra proposals whose signatures are not already licensed.
 *
 * @param {object[]} constructions
 * @param {Array<{left:string,right:string,result:string,head:0|1}>} [extraProposals]
 */
export function feedBondTables(constructions, extraProposals = []) {
  const list = constructions || [];
  const active = list.filter((c) => c.status !== CONSTRUCTION_STATUS.DEPRECATED);
  const carbon = active.filter((c) => classifyConstruction(c) === ELEMENT_PHASE.CARBON);
  const queue = graduationQueue(active);
  const seen = new Set(active.map((c) => `${c.left}|${c.right}|${c.result}`));
  const extras = [];
  for (const proposal of extraProposals) {
    if (!proposal) continue;
    const bond = [proposal.left, proposal.right, proposal.result, proposal.head];
    const sig = signatureOf(bond);
    if (seen.has(sig)) continue;
    if (bond[3] !== 0 && bond[3] !== 1) continue;
    seen.add(sig);
    extras.push(bond);
  }
  const overfeed = Object.freeze([...active.map(toBond), ...extras]);
  validateBonds(overfeed);
  return {
    CARBON_ONLY: bondsFrom(carbon),
    GRADUATED: bondsFrom([...carbon, ...queue]),
    FULL: bondsFrom(active),
    OVERFEED: overfeed,
  };
}
