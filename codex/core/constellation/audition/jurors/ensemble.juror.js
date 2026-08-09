import { isValidVote, AUDITION_JUROR_IDS } from '../schemas.js';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * ENSEMBLE — rewards answers that multiple roots / projections agree on
 * (G2P GRAPH analogue: agreement is the edge match).
 *
 * Does not invent structure. Only reads `candidate.agreement` filled by the
 * candidate generator from how often the same answerKey appeared.
 */
function scoreEnsemble(candidate) {
  if (!candidate || !candidate.answer) return null;

  const agreement = Math.max(1, Number(candidate.agreement) || 1);
  // Soft saturate: 1 → ~0.5, 2 → ~0.75, 3+ → ~0.9+
  const confidence = clamp(1 - Math.exp(-0.55 * agreement), 0, 1);
  const tokenWeight = clamp(0.35 + 0.2 * Math.min(agreement, 4), 0.05, 1.5);
  const stageSignal = clamp(0.8 + 0.1 * Math.min(agreement, 4), 0.05, 1.6);

  return {
    candidateKey: candidate.candidateKey,
    jurorId: AUDITION_JUROR_IDS.ENSEMBLE,
    tokenWeight,
    confidence,
    stageSignal,
    syntaxModifier: 1,
    rationale: `Ensemble agreement: answer appeared ${agreement} time(s) across projections.`,
    fidelityGrade: agreement >= 2 ? 'A' : 'C',
  };
}

export function createEnsembleJuror() {
  return {
    id: AUDITION_JUROR_IDS.ENSEMBLE,
    vote(candidate) {
      const vote = scoreEnsemble(candidate);
      if (!vote || !isValidVote(vote)) return null;
      return vote;
    },
  };
}
