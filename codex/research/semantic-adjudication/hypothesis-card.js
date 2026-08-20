/**
 * Predicate hypothesis cards.
 *
 * Discovery inspires the card. Development cases may be preregistered.
 * Holdout is refused. The card cannot carry Ballistics.
 *
 * @module codex/research/semantic-adjudication/hypothesis-card
 */

import { assertNoBallistics } from './adjudication-schema.js';

export function makeHypothesisCard({
  predicate,
  observedHoleCount,
  discoveryCases = [],
  developmentCases = [],
  examples,
  proposedObservation,
  expectedEffect,
  falsifier,
  risk,
} = {}) {
  const all = [...discoveryCases, ...developmentCases];
  for (const row of all) {
    if (row.split === 'holdout') {
      throw new Error('holdout cases cannot enter a hypothesis card');
    }
  }

  const card = Object.freeze({
    predicate,
    observedHoleCount: observedHoleCount ?? discoveryCases.length,
    examples: Object.freeze(examples ?? discoveryCases.map((row) => Object.freeze({
      caseId: row.frozen?.caseId ?? row.caseId,
      query: row.frozen?.query ?? row.query,
      gold: row.gold,
    }))),
    proposedObservation: proposedObservation ?? null,
    expectedEffect: expectedEffect ?? null,
    falsifier: falsifier ?? null,
    risk: risk ?? null,
    preregisteredCases: Object.freeze(
      developmentCases.map((row) => row.frozen?.caseId ?? row.caseId).filter(Boolean),
    ),
  });

  const check = assertNoBallistics(card);
  if (!check.ok) throw new Error(`hypothesis card leaked Ballistics (${check.reason})`);
  return card;
}
