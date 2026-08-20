/**
 * Secondary Ballistics calibration. Never writes a selection.
 *
 * @module codex/research/semantic-adjudication/evaluate-ballistics
 */

import { SPLIT_BANDS, isGoldRefusal } from './adjudication-schema.js';
import { splitBandOf } from './stratify.js';

export function ballisticsTopSenseId(frozen) {
  let bestId = null;
  let best = -Infinity;
  for (const row of frozen?.ballistics?.scores || []) {
    if (typeof row?.semanticScore !== 'number' || !Number.isFinite(row.semanticScore)) continue;
    if (row.semanticScore > best || (row.semanticScore === best && String(row.senseId) < String(bestId))) {
      best = row.semanticScore;
      bestId = row.senseId;
    }
  }
  return bestId;
}

export function flipBallisticsScores(frozen) {
  const scores = (frozen.ballistics?.scores || []).map((row) => Object.freeze({
    senseId: row.senseId,
    semanticScore: typeof row.semanticScore === 'number' ? 1 - row.semanticScore : row.semanticScore,
  }));
  const finite = scores
    .map((s) => s.semanticScore)
    .filter((n) => typeof n === 'number' && Number.isFinite(n));
  const split = finite.length >= 2 ? Math.max(...finite) - Math.min(...finite) : frozen.ballistics?.split ?? null;
  return Object.freeze({
    ...frozen,
    caseId: frozen.caseId,
    probe: frozen.probe,
    ballistics: Object.freeze({
      ...frozen.ballistics,
      scores: Object.freeze(scores),
      split,
    }),
  });
}

export function calibrateBallistics(rows) {
  const byBand = {};
  for (const band of SPLIT_BANDS) {
    byBand[band.id] = { n: 0, aligned: 0, pTopEqualsGold: null };
  }
  let recoverable = 0;
  for (const row of rows || []) {
    if (isGoldRefusal(row.gold) || !row.gold) continue;
    recoverable += 1;
    const band = splitBandOf(row.frozen?.ballistics?.split);
    if (!band || !byBand[band]) continue;
    byBand[band].n += 1;
    if (ballisticsTopSenseId(row.frozen) === row.gold) byBand[band].aligned += 1;
  }
  for (const rec of Object.values(byBand)) {
    rec.pTopEqualsGold = rec.n > 0 ? rec.aligned / rec.n : null;
  }
  return Object.freeze({
    recoverable,
    byBand: Object.freeze(byBand),
  });
}
