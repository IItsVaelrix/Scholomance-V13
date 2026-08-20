/**
 * Cluster Type I holes and rank candidate predicates.
 * Holdout cases are refused here — this is design, not measurement.
 *
 * @module codex/research/semantic-adjudication/cluster-predicates
 */

import { isGoldRefusal } from './adjudication-schema.js';

export function refuseHoldout(row, splits) {
  const id = row?.caseId || row?.frozen?.caseId;
  const holdIds = new Set((splits?.holdout || []).map((c) => c.caseId || c.frozen?.caseId));
  if (holdIds.has(id)) return Object.freeze({ ok: false, reason: 'holdout' });
  return Object.freeze({ ok: true });
}

function lemmaOf(row) {
  const raw = row.frozen?.candidateSenses?.[0]?.lemma
    || row.frozen?.frameEvidence?.headToken
    || row.frozen?.identity?.primaryContentToken
    || null;
  return raw ? String(raw).toLowerCase() : null;
}

export function clusterPredicates(rows) {
  for (const row of rows || []) {
    if (row.split === 'holdout') {
      throw new Error('holdout cases cannot enter predicate clustering');
    }
  }
  const byFamily = new Map();
  for (const row of rows || []) {
    if (row.failureLayer && row.failureLayer !== 'TYPE_I_PROBE_HOLE') continue;
    const fam = row.predicateFamily || 'OTHER';
    if (!byFamily.has(fam)) byFamily.set(fam, []);
    byFamily.get(fam).push(row);
  }
  return [...byFamily.entries()].map(([predicateFamily, items]) => {
    const lemmas = [...new Set(items.map(lemmaOf).filter(Boolean))].sort();
    return Object.freeze({
      predicateFamily,
      cases: items.length,
      lemmas: Object.freeze(lemmas),
      goldRecoverable: items.filter((r) => !isGoldRefusal(r.gold)).length,
      items: Object.freeze(items),
    });
  });
}

const FEASIBILITY = Object.freeze({
  SYNTACTIC_FRAME: 0.95,
  MORPHOLOGY: 0.9,
  NUMBER: 0.85,
  ENTITY_TYPE: 0.8,
  ANIMACY: 0.8,
  HUMANNESS: 0.8,
  LOCATION: 0.75,
  MOTION: 0.75,
  DOMAIN: 0.7,
  AGENCY: 0.7,
  TEMPORALITY: 0.7,
  INSTRUMENTALITY: 0.65,
  MATERIALITY: 0.65,
  SELECTIONAL_ROLE: 0.6,
  EVENT_STRUCTURE: 0.55,
  STATE_CHANGE: 0.55,
  PART_WHOLE: 0.5,
  CAUSE_EFFECT: 0.5,
  SOCIAL_ROLE: 0.5,
  CONCRETENESS: 0.5,
  PHONETIC_ONLY: 0.2,
  OTHER: 0.35,
});

export function rankPredicateOpportunity(clusters) {
  return [...(clusters || [])].map((c) => {
    const recurrence = c.cases;
    const goldRecoverability = c.cases ? c.goldRecoverable / c.cases : 0;
    const lemmas = c.lemmas?.length || 0;
    const crossLexemeGenerality = c.cases ? lemmas / c.cases : 0;
    const implementationFeasibility = FEASIBILITY[c.predicateFamily] ?? 0.5;
    const discriminativePower = goldRecoverability;
    const opportunity = recurrence
      * goldRecoverability
      * discriminativePower
      * implementationFeasibility
      * (0.5 + crossLexemeGenerality);
    return Object.freeze({
      ...c,
      opportunity,
      recurrence,
      goldRecoverability,
      discriminativePower,
      implementationFeasibility,
      crossLexemeGenerality,
    });
  }).sort((a, b) => b.opportunity - a.opportunity
    || b.cases - a.cases
    || a.predicateFamily.localeCompare(b.predicateFamily));
}

export function topRecurringHoles(ranked, n = 3) {
  return (ranked || []).slice(0, n);
}
