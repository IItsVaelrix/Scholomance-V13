/**
 * Decision-bearing coverage on packed cells.
 *
 * Separates punctuation glue from competing content interfaces.
 * Does not rank. Does not admit bonds. Does not invent punctuation semantics.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/decision-bearing
 */

import { composeMeanings, leafMeaning } from './compositional-semantics.js';
import { diagnoseT1Edge, observeDerivationCoverage } from './observe-coverage.js';

const NAMED_FAMILY = Object.freeze({
  'clause-predication': 'argument',
  'object-predication': 'argument',
  'copular-predication': 'argument',
  'auxiliary-composition': 'argument',
  'intersective-modification': 'modifier',
  'adverbial-modification': 'modifier',
  'compound-nominal': 'modifier',
  determination: 'modifier',
  'nominal-adjunction': 'modifier',
  'verbal-adjunction': 'modifier',
  'infinitival-adjunction': 'modifier',
  adposition: 'complement',
  'infinitival-composition': 'complement',
  relativization: 'relative',
  'relative-adjunction': 'relative',
  subordination: 'complement',
  coordination: 'coordination',
});

function isPunctType(type) {
  return type === 'PUNCT' || type === 'COMMA';
}

export function isGlueBond(bond) {
  if (!Array.isArray(bond) || bond.length < 3) return false;
  const [left, right, result] = bond;
  if (isPunctType(left) || isPunctType(right)) return true;
  return left === 'SCOMMA' && right === 'S' && result === 'S';
}

function familyFromUninterpreted(bond) {
  const [left, right, result] = bond;
  if (left === 'PP' && (right === 'S' || right === 'VP')) return 'clause-attachment';
  if (left === 'FRONTED' && (right === 'S' || right === 'VP')) return 'clause-attachment';
  if (left === 'SBAR' || right === 'SBAR') return 'complement';
  if ((left === 'V' || left === 'VP') && right === 'INF') return 'complement';
  if (left === 'CONJ' || String(right).startsWith('CONJ')) return 'coordination';
  if (result === 'INV' || left === 'INV') return 'argument';
  if (result === 'PART' || right === 'PART' || right === 'PRT') return 'complement';
  if (result === 'APPOS' || (left === 'NPCOMMA' && right === 'NP')) return 'apposition';
  if (left === 'REL') return 'relative';
  if (left === 'SUB') return 'complement';
  if (right === 'PP') return 'modifier';
  if ((left === 'N' || left === 'PROPN') && (right === 'N' || right === 'PROPN')) return 'modifier';
  return 'unclassified';
}

export function bondFamily(bond) {
  if (!bond) return 'lift';
  if (isGlueBond(bond)) return 'glue';
  const rule = composeMeanings(
    { readings: [{ unknown: true }] },
    { readings: [{ unknown: true }] },
    bond,
  ).rule;
  if (rule !== 'uninterpreted-bond') return NAMED_FAMILY[rule] || 'unclassified';
  return familyFromUninterpreted(bond);
}

export function lemmaOf(node) {
  const heads = node?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return String(heads[0]).toLowerCase();
  const lemmas = node?.nucleus?.lemmas;
  if (Array.isArray(lemmas) && lemmas[0]) return String(lemmas[0]).toLowerCase();
  if (node?.token != null) return String(node.token).toLowerCase();
  return '';
}

export function derivationSignature(derivation) {
  if (!derivation) return 'empty';
  if (derivation.lift) {
    const child = derivation.child;
    return `L:${child?.type || '?'}:${child?.from ?? '?'}-${child?.to ?? '?'}->${derivation.lift}`;
  }
  const bond = derivation.bond;
  const left = derivation.left;
  const right = derivation.right;
  const sig = bond ? `${bond[0]}+${bond[1]}->${bond[2]}` : 'bare';
  return [
    sig,
    `${left?.type || '?'}:${left?.from ?? '?'}-${left?.to ?? '?'}`,
    `${right?.type || '?'}:${right?.from ?? '?'}-${right?.to ?? '?'}`,
  ].join('|');
}

export function asLeaf(node) {
  return {
    type: node?.type,
    from: node?.from,
    to: node?.to,
    token: lemmaOf(node),
    nucleus: node?.nucleus || { headLemmas: [lemmaOf(node)] },
    derivations: [],
  };
}

function factorKey(row) {
  return `${row.rule}|${row.complete ? '1' : '0'}|${row.t1Status}|${row.t1Score ?? ''}`;
}

function isSilent(row) {
  return !(row.named && row.complete) && row.t1Status !== 'could-fire';
}

function interfaceOf(derivation, lexicon, provider) {
  if (derivation?.lift) {
    return Object.freeze({
      signature: derivationSignature(derivation),
      family: 'lift',
      rule: 'lift',
      named: false,
      complete: false,
      t1Status: 'no-relation',
      t1Score: null,
      bond: null,
    });
  }
  const bond = derivation?.bond;
  const coverage = observeDerivationCoverage(
    leafMeaning(asLeaf(derivation.left), lexicon),
    leafMeaning(asLeaf(derivation.right), lexicon),
    bond,
  );
  const edge = diagnoseT1Edge(
    { lemma: lemmaOf(derivation.left), type: derivation.left?.type },
    { lemma: lemmaOf(derivation.right), type: derivation.right?.type, side: 'right' },
    provider,
  );
  return Object.freeze({
    signature: derivationSignature(derivation),
    family: bondFamily(bond),
    rule: coverage.rule,
    named: coverage.named,
    complete: coverage.complete,
    t1Status: edge.status,
    t1Score: edge.score,
    bond,
  });
}

export function observeCompetitiveCell(node, lexicon, provider) {
  const derivations = node?.derivations || [];
  const bySignature = new Map();
  for (const derivation of derivations) {
    const signature = derivationSignature(derivation);
    if (!bySignature.has(signature)) bySignature.set(signature, derivation);
  }
  const unique = [...bySignature.values()];
  const decision = unique.filter((derivation) => !isGlueBond(derivation.bond));
  const rows = decision.map((derivation) => interfaceOf(derivation, lexicon, provider));
  const keys = rows.map(factorKey);
  const distinctKeys = new Set(keys).size;
  const live = rows.filter((row) => !isSilent(row));
  const liveKeys = new Set(live.map(factorKey));
  const missingFamilies = [...new Set(
    rows
      .filter((row) => isSilent(row) && row.family !== 'lift')
      .map((row) => row.family),
  )];

  return Object.freeze({
    competitive: unique.length >= 2,
    decisionCompetitive: decision.length >= 2,
    weaklyDistinguishable: decision.length >= 2 && distinctKeys >= 2,
    stronglyDistinguishable: decision.length >= 2 && live.length >= 2 && liveKeys.size >= 2,
    missingFamilies: Object.freeze(missingFamilies),
    rows: Object.freeze(rows),
    uniqueSignatures: unique.length,
    decisionSignatures: decision.length,
  });
}

export function summarizeDecisionBearing(raw) {
  const groups = Number(raw.decisionCompetitiveCells) || 0;
  const edges = Number(raw.decisionBearingEdges) || 0;
  const rate = (n, d) => (d > 0 ? n / d : 0);
  return Object.freeze({
    decisionBearingGroupRate: rate(raw.stronglyDistinguishable, groups),
    weakDistinguishRate: rate(raw.weaklyDistinguishable, groups),
    decisionBearingEdgeCouldFireRate: rate(raw.decisionBearingCouldFire, edges),
    packedCells: raw.packedCells || 0,
    competitiveCells: raw.competitiveCells || 0,
    decisionCompetitiveCells: groups,
  });
}
