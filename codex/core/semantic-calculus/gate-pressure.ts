/**
 * GATE PRESSURE — per-candidate pressure vectors from the CLI gate.
 * ========================================================================
 *
 * PHASE 0 of the Pressure Field Governor PDR, addressing the defect found in
 * the first audit of the shipped ledger:
 *
 *   Every governor receipt carries ONE candidate, ONE pressure source, at
 *   magnitude exactly 1.0. A governor block is a UNARY event — there is no
 *   rival, no comparison, no gradient. So the feature vector over the whole
 *   corpus is a one-hot across nine rule categories, and a fit over it can
 *   only ever learn "category X over-fires". That is a per-rule precision
 *   measurement, which is worth having, but it is NOT a test of whether
 *   graded multi-source pressure separates good trajectories from bad. The
 *   pressure-field hypothesis is about RANKING AMONG RIVALS, and Phase 0 as
 *   first shipped instrumented the one event shape that never has any.
 *
 * `scholo-gate.mjs` is the only place in the tree that already produces a
 * genuine candidate SET: `lexicalProposer.propose` returns up to five scored
 * rivals for one utterance. Emitting there yields receipts with rivals, which
 * is what the separability criterion actually needs.
 *
 * F10 — NO SELF-SCORED PRESSURE. Every source below resolves from a producer
 * that is not the ranker, and each one names that producer in `provenance`,
 * so the property is a query over the corpus rather than a promise in a
 * docstring:
 *
 *   destructive    cliLexicon      effect: 'mutate' | 'read'  (human-authored)
 *   authorization  utterance.ts    confirmationsRequired(...) > 0
 *   law            kind.ts         adjudicateLaw(...).decision
 *   goal           lexicalProposer Jaccard hits/union over the utterance
 *
 * `goal` is the one value the proposer authors, and it is attraction rather
 * than pressure — it cannot deflect anything, only rank. The three sources
 * that can express resistance all come from elsewhere.
 *
 * DELIBERATELY ABSENT: `uncertainty` and `evidence`. Both are properties of
 * the PROPOSAL (margin against minMargin; warrants required vs present), not
 * of a candidate, so they take the same value for every rival and would add a
 * column that cannot discriminate. A constant feature is not a weak signal,
 * it is a fake one — and this repository has a name for instruments that look
 * like measurements and cannot vary. They belong on the receipt envelope if
 * they belong anywhere, not in the per-candidate vector.
 */

export type LawDecision = 'allow' | 'clarify' | 'block' | 'escalate';

/**
 * Law decision → Tier-0 pressure. Ordinal, matching `simulate-law-gate`'s
 * ternary shape rather than inventing resolution the producer does not have
 * (PDR A2). `block` reaches RIDGE_CEILING; nothing else does.
 */
export const LAW_PRESSURE: Readonly<Record<LawDecision, number>> = Object.freeze({
  allow: 0,
  clarify: 0.35,
  escalate: 0.7,
  block: 1,
});

export interface GateCandidateInput {
  key: string;
  /** Jaccard score from lexicalProposer, 0..1. */
  score: number;
  /** From the CLI lexicon entry; undefined when the key has no entry. */
  effect?: 'read' | 'mutate';
  /** Law decision adjudicated for THIS candidate's kind and risk profile. */
  lawDecision: LawDecision;
  /** confirmationsRequired(...) for this candidate's confirmation policy. */
  confirmationsRequired: number;
}

export interface GateCandidate {
  key: string;
  pressure: Record<string, number>;
  result: 'PERMITTED' | 'DEFLECTED';
  dominant_source: string;
  gate_considered: null;
  governor: 'scholo-gate';
  provenance: Record<string, string>;
}

const PRODUCERS = Object.freeze({
  destructive: 'cliLexicon.classify',
  authorization: 'utterance.confirmationsRequired',
  law: 'kind.adjudicateLaw',
  goal: 'proposer.lexicalProposer',
});

function clampScore(score: number): number {
  // The proposer returns hits/union, which is 0..1 by construction. A value
  // outside that range means the producer changed shape, and silently
  // clamping it would hide the change — so refuse instead.
  if (!Number.isFinite(score) || score < 0 || score > 1) {
    throw new Error(`gate-pressure: proposer score ${score} is outside 0..1 — producer contract changed`);
  }
  return score;
}

/**
 * Build one candidate's pressure vector. `dominant_source` is the largest
 * PRESSURE (attraction is excluded — `goal` is never what deflected anything;
 * reporting it as dominant would read as "the goal blocked this").
 */
export function candidatePressure(input: GateCandidateInput): GateCandidate {
  const pressure: Record<string, number> = {
    destructive: input.effect === 'mutate' ? 1 : 0,
    authorization: input.confirmationsRequired > 0 ? 1 : 0,
    law: LAW_PRESSURE[input.lawDecision],
    goal: -clampScore(input.score),
  };

  const resistive = ['law', 'destructive', 'authorization'] as const;
  let dominant: string = resistive[0];
  for (const source of resistive) {
    if (pressure[source] > pressure[dominant]) dominant = source;
  }

  return {
    key: input.key,
    pressure,
    result: 'PERMITTED', // Phase 0 has no ridges; nothing can deflect yet.
    dominant_source: dominant,
    gate_considered: null,
    governor: 'scholo-gate',
    provenance: { ...PRODUCERS },
  };
}

/**
 * Build the full candidate list for one utterance, ordered as the proposer
 * ordered them. The caller supplies `selected` — the key the gate actually
 * picked, or null when it refused to pick (Clarify / Theory), which is a real
 * STALLED outcome that is NOT a governor block.
 */
export function gateCandidates(inputs: GateCandidateInput[]): GateCandidate[] {
  return inputs.map(candidatePressure);
}
