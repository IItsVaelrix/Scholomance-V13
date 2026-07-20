/**
 * @template {{key:string, score:number}} T
 * @param {readonly T[]} candidates
 * @returns {T[]}
 */
export function stableCandidates(candidates) {
  return [...candidates].sort(
    (left, right) => right.score - left.score || left.key.localeCompare(right.key),
  );
}

/**
 * @param {readonly {key:string, score:number}[]} candidates
 * @param {readonly string[]} known
 * @param {{invented:string, invalidScore:string}} errors
 */
export function validateClosedCandidates(candidates, known, errors) {
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

/**
 * @template {{key:string, score:number}} T
 * @param {readonly T[]} candidates
 * @param {number} threshold
 * @returns {{status:'empty'|'single'|'clear'|'thin', margin:number, ranked:T[]}}
 */
export function assessCandidateMargin(candidates, threshold) {
  const ranked = stableCandidates(candidates);
  if (ranked.length === 0) return { status: 'empty', margin: 0, ranked };
  if (ranked.length === 1) return { status: 'single', margin: ranked[0].score, ranked };
  const margin = ranked[0].score - ranked[1].score;
  return {
    status: margin >= threshold ? 'clear' : 'thin',
    margin,
    ranked,
  };
}
