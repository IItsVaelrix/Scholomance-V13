/**
 * Inferential print helpers. A rounded 0 is not a p-value.
 *
 * PURE AND ZERO-I/O.
 *
 * @module codex/core/constellation/semantic-particles/stats
 */

export const EXACT_SIGN_TEST = 'exact-two-sided-sign';

export function exactTwoSidedSignP(successes, trials) {
  if (!Number.isFinite(trials) || trials <= 0) return 1;
  const k = Math.min(successes, trials - successes);
  let cumulative = 0;
  for (let i = 0; i <= k; i += 1) {
    let c = 1;
    for (let j = 0; j < i; j += 1) c = (c * (trials - j)) / (j + 1);
    cumulative += c;
  }
  return Math.min(1, (2 * cumulative) / (2 ** trials));
}

export function formatPValue(p, test = EXACT_SIGN_TEST) {
  const n = Number(p);
  if (!Number.isFinite(n)) {
    return Object.freeze({ pValue: null, printed: 'p = n/a', test });
  }
  if (n <= 0 || n < 1e-6) {
    return Object.freeze({ pValue: n, printed: 'p < 1e-6', test });
  }
  const rounded = Number(n.toPrecision(4));
  return Object.freeze({ pValue: n, printed: `p = ${rounded}`, test });
}
