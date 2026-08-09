import { isValidVote, AUDITION_JUROR_IDS } from '../schemas.js';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * ORDER — weak deterministic last resort (G2P HHM analogue).
 *
 * Earlier projection order wins ties when structural jurors are indifferent.
 * This makes the room's cast stable under identical input without claiming
 * linguistic insight — it is the explicit form of "first stable" so the
 * baseline can be measured and outvoted.
 */
function scoreOrder(candidate) {
  if (!candidate || !candidate.answer) return null;

  const order = Number.isFinite(candidate.order) ? candidate.order : 0;
  // order 0 → high, later → lower, never zero.
  const confidence = clamp(0.55 - 0.03 * order, 0.2, 0.55);
  const tokenWeight = 0.5;
  const stageSignal = 0.9;

  return {
    candidateKey: candidate.candidateKey,
    jurorId: AUDITION_JUROR_IDS.ORDER,
    tokenWeight,
    confidence,
    stageSignal,
    syntaxModifier: 1,
    rationale: `Ensemble order index=${order} (earlier is weakly preferred for determinism).`,
    fidelityGrade: 'C',
  };
}

export function createOrderJuror() {
  return {
    id: AUDITION_JUROR_IDS.ORDER,
    vote(candidate) {
      const vote = scoreOrder(candidate);
      if (!vote || !isValidVote(vote)) return null;
      return vote;
    },
  };
}
