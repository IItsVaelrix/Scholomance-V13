/**
 * Local derivation factors and exact role-filler bindings (T3 / T7).
 *
 * Factors are named and must sum to the local score. Bindings are symbolic.
 * Nothing here admits a bond.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/derivation-factors
 */

import { classifyBond, BOND_REACTION } from '../bond-kind.js';
import { quantizeScore } from './schema.js';
import { selectionalCharge } from './selectional-index.js';

const ROLE_BY_SIGNATURE = Object.freeze({
  'NP|VP|S': Object.freeze({ left: 'subject', right: 'predicate' }),
  'V|NP|VP': Object.freeze({ left: 'verb', right: 'object' }),
  'V|NPO|VP': Object.freeze({ left: 'verb', right: 'object' }),
  'DET|N|NP': Object.freeze({ left: 'determiner', right: 'nominal' }),
  'P|NP|PP': Object.freeze({ left: 'preposition', right: 'nominal' }),
  'COP|ADJ|VP': Object.freeze({ left: 'copula', right: 'predicate' }),
  'COP|NP|VP': Object.freeze({ left: 'copula', right: 'predicate' }),
  'ADJ|N|N': Object.freeze({ left: 'modifier', right: 'head' }),
  'ADV|VP|VP': Object.freeze({ left: 'modifier', right: 'head' }),
});

function headLemma(node) {
  const heads = node?.nucleus?.headLemmas;
  if (Array.isArray(heads) && heads[0]) return String(heads[0]).toLowerCase();
  const lemmas = node?.nucleus?.lemmas;
  if (Array.isArray(lemmas) && lemmas[0]) return String(lemmas[0]).toLowerCase();
  if (node?.token != null) return String(node.token).toLowerCase();
  return null;
}

export function childNodeId(node) {
  if (!node) return 'null';
  return `${node.type}:${node.from}:${node.to}`;
}

export function derivationId(node, derivation, index = 0) {
  if (!derivation) return `${childNodeId(node)}:leaf`;
  if (derivation.lift) {
    return `${childNodeId(node)}|lift:${derivation.lift}|${childNodeId(derivation.child)}|#${index}`;
  }
  const bond = derivation.bond;
  const sig = bond ? `${bond[0]}+${bond[1]}->${bond[2]}` : 'bare';
  return `${childNodeId(node)}|${sig}|${childNodeId(derivation.left)}|${childNodeId(derivation.right)}|#${index}`;
}

export function nodeId(node, derivation, index) {
  if (derivation) return derivationId(node, derivation, index);
  return childNodeId(node);
}

export function extractBindings(derivation) {
  if (!derivation?.bond) return Object.freeze([]);
  const bond = derivation.bond;
  const roles = ROLE_BY_SIGNATURE[`${bond[0]}|${bond[1]}|${bond[2]}`];
  if (!roles) return Object.freeze([]);
  const bindings = [];
  if (roles.left) {
    bindings.push({
      role: roles.left,
      filler: headLemma(derivation.left),
      side: 'left',
      source: `${bond[0]}+${bond[1]}->${bond[2]}`,
    });
  }
  if (roles.right) {
    bindings.push({
      role: roles.right,
      filler: headLemma(derivation.right),
      side: 'right',
      source: `${bond[0]}+${bond[1]}->${bond[2]}`,
    });
  }
  bindings.sort((a, b) => a.role.localeCompare(b.role) || String(a.filler).localeCompare(String(b.filler)));
  return Object.freeze(bindings.map((row) => Object.freeze(row)));
}

export function bindingSignature(bindings) {
  return (bindings || [])
    .map((b) => `${b.role}=${b.filler ?? ''}`)
    .sort()
    .join('|');
}

function syntaxScore(derivation) {
  if (derivation?.lift) return 0.5;
  if (!derivation?.bond) return 0;
  const kind = classifyBond(derivation.bond);
  if (kind === BOND_REACTION.CONSTRUCTIVE) return 1;
  if (kind === BOND_REACTION.PRESERVATIVE) return 0.25;
  if (kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) return 0.1;
  return 0;
}

function provenanceScore(derivation) {
  if (!derivation) return 0;
  if (derivation.adjunctEligible === false) return 0;
  if (derivation.clauseOrigin === 'subject-predicate') return 1;
  if (derivation.clauseOrigin === 'imperative') return 0.25;
  return 0.5;
}

export function localFactors(node, derivation, ctx = {}) {
  const syntax = quantizeScore(syntaxScore(derivation));
  let semantic = 0;
  if (ctx.selectionalIndex && derivation?.bond) {
    const charge = selectionalCharge(
      derivation.left,
      derivation.right,
      derivation.bond,
      ctx.selectionalIndex,
      { featureProvider: ctx.featureProvider },
    );
    semantic = charge.abstain ? 0 : charge.score;
  }
  semantic = quantizeScore(semantic);
  const provenance = quantizeScore(provenanceScore(derivation));
  const total = quantizeScore(syntax + semantic + provenance);
  return Object.freeze({
    syntax,
    semantic,
    provenance,
    total,
    contributions: Object.freeze([
      Object.freeze({ name: 'syntax', value: syntax }),
      Object.freeze({ name: 'semantic', value: semantic }),
      Object.freeze({ name: 'provenance', value: provenance }),
    ]),
    derivationId: derivationId(node, derivation, ctx.index || 0),
    bindings: extractBindings(derivation),
  });
}
