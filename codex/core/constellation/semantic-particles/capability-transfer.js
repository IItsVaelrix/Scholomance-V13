/**
 * T4 — PROVENANCE AND RECURSIVE-PRIVILEGE ISOTOPES
 *
 * Privileges are capability particles transferred by an authored table keyed
 * by bond/lift identity, never by surface POS density. A preservative edge
 * may preserve or reduce privilege. It may not create it.
 *
 * Phase 1 is an observer plus a static cycle census. Admission stays in
 * bond-admission.js. This module must agree with clauseProvenance.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/capability-transfer
 */

import { classifyBond, BOND_REACTION } from '../bond-kind.js';
import { clauseProvenance, imperativeLiftProvenance } from '../bond-admission.js';
import { internParticle } from './schema.js';

export const CAPABILITY_KEYS = Object.freeze([
  'rootEligible',
  'adjunctEligible',
  'recursiveEligible',
  'matrixHeadEligible',
  'clauseOrigin',
  'semanticSource',
  'promotionEvidence',
]);

const BOOL_CAPS = Object.freeze([
  'rootEligible',
  'adjunctEligible',
  'recursiveEligible',
  'matrixHeadEligible',
]);

export function emptyCapabilities() {
  return {
    rootEligible: false,
    adjunctEligible: false,
    recursiveEligible: false,
    matrixHeadEligible: false,
    clauseOrigin: null,
    semanticSource: null,
    promotionEvidence: null,
  };
}

export function classifyRule(rule) {
  if (rule?.lift) return { kind: 'lift', id: `lift:${rule.src || '?'}->${rule.lift}` };
  if (!rule?.bond) return { kind: 'unknown', id: 'unknown' };
  const kind = classifyBond(rule.bond);
  const id = `${rule.bond[0]}+${rule.bond[1]}->${rule.bond[2]}`;
  return { kind, id };
}

function sealCaps(partial, source) {
  const caps = emptyCapabilities();
  for (const key of CAPABILITY_KEYS) {
    if (partial[key] !== undefined) caps[key] = partial[key];
  }
  caps.matrixHeadEligible = Boolean(caps.rootEligible);
  caps.semanticSource = source;
  return caps;
}

function inheritFrom(child, source) {
  return sealCaps({
    rootEligible: Boolean(child?.rootEligible),
    adjunctEligible: Boolean(child?.adjunctEligible),
    recursiveEligible: Boolean(child?.recursiveEligible),
    clauseOrigin: child?.clauseOrigin || null,
    promotionEvidence: child?.promotionEvidence || null,
  }, source);
}

function intersectCaps(left, right, source) {
  return sealCaps({
    rootEligible: Boolean(left?.rootEligible) && Boolean(right?.rootEligible),
    adjunctEligible: Boolean(left?.adjunctEligible) && Boolean(right?.adjunctEligible),
    recursiveEligible: Boolean(left?.recursiveEligible) && Boolean(right?.recursiveEligible),
    clauseOrigin: left?.clauseOrigin || right?.clauseOrigin || null,
  }, source);
}

/**
 * Authored transfer. Mirrors clauseProvenance for S-building rules so the
 * observer cannot drift from the admission law.
 */
export function transferCapabilities(leftCaps, rightCaps, rule) {
  const { kind, id } = classifyRule(rule);
  if (rule?.lift === 'S' && rule.src === 'VP') {
    return sealCaps({
      ...imperativeLiftProvenance(),
      recursiveEligible: false,
    }, id);
  }
  if (rule?.lift) {
    return inheritFrom(leftCaps, id);
  }
  const bond = rule?.bond;
  if (!bond) return emptyCapabilities();

  if (bond[2] === 'S') {
    const left = { type: bond[0], derivations: [] };
    const right = { type: bond[1], derivations: [] };
    if (bond[1] === 'S' && rightCaps) {
      right.derivations = [{ adjunctEligible: rightCaps.adjunctEligible !== false }];
    }
    if (bond[0] === 'S' && leftCaps) {
      left.derivations = [{ adjunctEligible: leftCaps.adjunctEligible !== false }];
    }
    const proven = clauseProvenance(left, right, bond) || {};
    const child = bond[1] === 'S' ? rightCaps : bond[0] === 'S' ? leftCaps : null;
    return sealCaps({
      ...proven,
      recursiveEligible: kind === BOND_REACTION.CONSTRUCTIVE
        ? true
        : Boolean(child?.recursiveEligible),
      clauseOrigin: proven.clauseOrigin || child?.clauseOrigin || null,
    }, id);
  }

  if (kind === BOND_REACTION.CONSTRUCTIVE) {
    return sealCaps({
      rootEligible: Boolean(leftCaps?.rootEligible) || Boolean(rightCaps?.rootEligible),
      adjunctEligible: Boolean(leftCaps?.adjunctEligible) || Boolean(rightCaps?.adjunctEligible),
      recursiveEligible: Boolean(leftCaps?.recursiveEligible) || Boolean(rightCaps?.recursiveEligible),
      clauseOrigin: leftCaps?.clauseOrigin || rightCaps?.clauseOrigin || null,
    }, id);
  }

  const head = bond[3] === 1 ? rightCaps : leftCaps;
  if (head) return inheritFrom(head, id);
  return intersectCaps(leftCaps, rightCaps, id);
}

export function capabilitiesAgreeWithProvenance(left, right, bond) {
  const proven = clauseProvenance(left, right, bond);
  if (!proven) return true;
  const transferred = transferCapabilities(emptyCapabilities(), emptyCapabilities(), { bond });
  return proven.clauseOrigin === transferred.clauseOrigin
    && proven.adjunctEligible === transferred.adjunctEligible
    && proven.rootEligible === transferred.rootEligible;
}

/** Fronting is authored contextual evidence, not a silent launder. */
const AUTHORIZED_PROMOTIONS = new Set(['PP+S->S', 'FRONTED+S->S', 'lift:VP->S']);

/**
 * Root eligibility follows from building an S. The Uranium-class leak is
 * minting adjunct or recursive privilege on a preservative edge.
 */
const DANGEROUS_CAPS = Object.freeze(['adjunctEligible', 'recursiveEligible']);

function gainedPrivilege(input, output) {
  const gained = [];
  for (const key of DANGEROUS_CAPS) {
    if (output[key] && !input[key]) gained.push(key);
  }
  return gained;
}

function maxCaps(left, right) {
  const out = emptyCapabilities();
  for (const key of BOOL_CAPS) {
    out[key] = Boolean(left?.[key]) || Boolean(right?.[key]);
  }
  return out;
}

/**
 * Conservative static census: a preservative or recursive-preservative rule
 * must not mint a privilege from barren inputs. Lifts and constructive
 * rules may, when authored.
 */
export function censusPrivilegeCycles(bonds, lifts, options = {}) {
  const violations = [];
  const transfers = options.transfers || {};

  for (const bond of bonds || []) {
    const rule = { bond };
    const { kind, id } = classifyRule(rule);
    const left = emptyCapabilities();
    const right = emptyCapabilities();
    const custom = transfers[id];
    const out = custom ? { ...emptyCapabilities(), ...custom(left, right) } : transferCapabilities(left, right, rule);
    if (kind === BOND_REACTION.PRESERVATIVE || kind === BOND_REACTION.RECURSIVE_PRESERVATIVE) {
      if (!AUTHORIZED_PROMOTIONS.has(id)) {
        const gained = gainedPrivilege(maxCaps(left, right), out);
        if (gained.length > 0) {
          violations.push({ rule: id, kind, gained });
        }
      }
    }
  }

  for (const lift of lifts || []) {
    const src = Array.isArray(lift) ? lift[0] : lift.src;
    const dst = Array.isArray(lift) ? lift[1] : lift.dst;
    const rule = { lift: dst, src };
    const { id } = classifyRule(rule);
    const custom = transfers[id];
    if (custom) {
      const out = { ...emptyCapabilities(), ...custom(emptyCapabilities(), null) };
      const gained = gainedPrivilege(emptyCapabilities(), out);
      if (gained.length && !(src === 'VP' && dst === 'S')) {
        violations.push({ rule: id, kind: 'lift', gained });
      }
    }
  }

  return Object.freeze({
    ok: violations.length === 0,
    violations: Object.freeze(violations),
  });
}

export function capabilityParticle(caps, scope = 'DERIVATION') {
  return internParticle({
    scope,
    kind: 'capability.lattice',
    value: {
      rootEligible: Boolean(caps.rootEligible),
      adjunctEligible: Boolean(caps.adjunctEligible),
      recursiveEligible: Boolean(caps.recursiveEligible),
      clauseOrigin: caps.clauseOrigin || null,
    },
    polarity: 'OBSERVE',
    confidence: 1,
    evidence: [{ source: 'authored-transfer', ref: caps.semanticSource || 'unknown' }],
    permissions: ['OBSERVE', 'CARRY_CAPABILITY'],
    createdBy: 'authoredRule',
  });
}
