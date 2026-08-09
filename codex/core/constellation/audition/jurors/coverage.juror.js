import { isValidVote, AUDITION_JUROR_IDS } from '../schemas.js';

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}

/**
 * COVERAGE — prefers slips drawn from a full-span stable root.
 *
 * Stability-as-coverage is compose's veto for stranded content words. Here it
 * is a soft preference among already-stable projections: a spanning root is a
 * stronger cast than a partial that only happened to project.
 */
function scoreCoverage(candidate) {
  if (!candidate || !candidate.answer) return null;

  const spanning = Boolean(candidate.spanning);
  const n = Number(candidate.n) || 0;
  const width = Number.isFinite(candidate.from) && Number.isFinite(candidate.to)
    ? (candidate.to - candidate.from + 1)
    : 0;
  const fill = n > 0 ? clamp(width / n, 0, 1) : (spanning ? 1 : 0.5);

  const confidence = clamp((spanning ? 0.85 : 0.45) + 0.15 * fill, 0, 1);
  const tokenWeight = clamp(0.4 + 0.4 * fill, 0.05, 1.5);
  const stageSignal = spanning ? 1.2 : 0.7;

  return {
    candidateKey: candidate.candidateKey,
    jurorId: AUDITION_JUROR_IDS.COVERAGE,
    tokenWeight,
    confidence,
    stageSignal,
    syntaxModifier: 1,
    rationale: spanning
      ? `Full-span root (${width}/${n || width} tokens).`
      : `Partial span ${candidate.from}–${candidate.to} of ${n || '?'} tokens (fill=${fill.toFixed(2)}).`,
    fidelityGrade: spanning ? 'A' : 'C',
  };
}

export function createCoverageJuror() {
  return {
    id: AUDITION_JUROR_IDS.COVERAGE,
    vote(candidate) {
      const vote = scoreCoverage(candidate);
      if (!vote || !isValidVote(vote)) return null;
      return vote;
    },
  };
}
