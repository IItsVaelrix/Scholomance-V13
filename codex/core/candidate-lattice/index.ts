export interface RankedCandidate {
  key: string;
  score: number;
  why?: string;
}

export type CandidateMargin<T extends RankedCandidate> =
  | { status: 'empty'; margin: 0; ranked: T[] }
  | { status: 'single'; margin: number; ranked: T[] }
  | { status: 'clear'; margin: number; ranked: T[] }
  | { status: 'thin'; margin: number; ranked: T[] };

export function stableCandidates<T extends RankedCandidate>(
  candidates: readonly T[],
): T[] {
  return [...candidates].sort(
    (left, right) => right.score - left.score || left.key.localeCompare(right.key),
  );
}

export function validateClosedCandidates(
  candidates: readonly RankedCandidate[],
  known: readonly string[],
  errors: { invented: string; invalidScore: string },
): void {
  const closed = new Set(known);
  for (const candidate of candidates) {
    if (!closed.has(candidate.key)) {
      throw new Error(`${errors.invented}: ${JSON.stringify(candidate.key)}`);
    }
    if (!Number.isFinite(candidate.score) || candidate.score < 0 || candidate.score > 1) {
      throw new Error(`${errors.invalidScore}: ${candidate.key}=${candidate.score}`);
    }
  }
}

export function assessCandidateMargin<T extends RankedCandidate>(
  candidates: readonly T[],
  threshold: number,
): CandidateMargin<T> {
  const ranked = stableCandidates(candidates);
  if (ranked.length === 0) return { status: 'empty', margin: 0, ranked };
  if (ranked.length === 1) {
    return { status: 'single', margin: ranked[0].score, ranked };
  }
  const margin = ranked[0].score - ranked[1].score;
  return {
    status: margin >= threshold ? 'clear' : 'thin',
    margin,
    ranked,
  };
}
