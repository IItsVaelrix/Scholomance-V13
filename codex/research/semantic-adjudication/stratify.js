/**
 * Strata, balanced sampling, and sealed split assignment.
 *
 * @module codex/research/semantic-adjudication/stratify
 */

import { MIN_COVERAGE_SPLIT } from '../../core/constellation/inquiry-coverage.js';
import { glossOverlapCount } from '../../core/semantic-calculus/hypothesisStatus.js';
import { SPLIT_BANDS } from './adjudication-schema.js';
import { contextTokensOf, seededShuffle } from './util.js';

export function splitBandOf(split) {
  if (typeof split !== 'number' || !Number.isFinite(split)) return null;
  if (split < MIN_COVERAGE_SPLIT) return null;
  for (const band of SPLIT_BANDS) {
    if (split >= band.min && split < band.max) return band.id;
  }
  return null;
}

function candidateCountBucket(n) {
  if (n <= 2) return '2';
  if (n <= 4) return '3-4';
  if (n <= 8) return '5-8';
  return '9+';
}

function queryLengthBucket(n) {
  if (n <= 1) return '1';
  if (n <= 3) return '2-3';
  if (n <= 6) return '4-6';
  return '7+';
}

function glossOverlapPattern(frozen) {
  const candidates = frozen.candidateSenses || [];
  const context = contextTokensOf(frozen.identity);
  if (!candidates.length) return 'none';
  const scores = candidates.map((c) => glossOverlapCount(c.gloss, context));
  const max = Math.max(...scores);
  if (max <= 0) return 'none';
  return scores.filter((n) => n === max).length === 1 ? 'unique' : 'tied';
}

export function describeStratum(frozen) {
  const candidates = frozen.candidateSenses || [];
  const posCounts = Object.create(null);
  for (const c of candidates) {
    const pos = c.pos || 'unk';
    posCounts[pos] = (posCounts[pos] || 0) + 1;
  }
  const majorityPos = Object.entries(posCounts).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0]
    ?? null;

  return Object.freeze({
    pos: frozen.frameEvidence?.framePos || majorityPos,
    candidateCount: candidates.length,
    candidateCountBucket: candidateCountBucket(candidates.length),
    queryLength: frozen.identity?.tokenCount ?? String(frozen.query || '').split(/\s+/).filter(Boolean).length,
    queryLengthBucket: queryLengthBucket(frozen.identity?.tokenCount ?? 0),
    senseFrequency: frozen.lexicalEvidence?.senseFrequency ?? null,
    glossOverlap: glossOverlapPattern(frozen),
    morphologicalAmbiguity: Boolean(frozen.lexicalEvidence?.morphologicalAmbiguity),
    heteronym: Boolean(frozen.frameEvidence?.isHeteronym),
    frameType: frozen.frameEvidence?.frameCue || 'none',
    splitBand: splitBandOf(frozen.ballistics?.split),
  });
}

/**
 * Balanced sample. Split band is the primary axis so frequent weak holes
 * cannot crowd out strong ones.
 */
export function stratifiedSample(cases, { n, seed = 0x5c4010 } = {}) {
  const target = Math.max(0, Math.min(Number(n) || 0, (cases || []).length));
  const byBand = new Map();
  for (const c of cases || []) {
    const band = splitBandOf(c.ballistics?.split) || 'unknown';
    if (!byBand.has(band)) byBand.set(band, []);
    byBand.get(band).push(c);
  }
  for (const [band, arr] of byBand) {
    byBand.set(band, seededShuffle(arr, `sample:${seed}:${band}`));
  }
  const bands = [...byBand.keys()].sort();
  const picked = [];
  const seen = new Set();
  while (picked.length < target) {
    let progressed = false;
    for (const band of bands) {
      const arr = byBand.get(band);
      while (arr.length) {
        const next = arr.shift();
        if (seen.has(next.caseId)) continue;
        seen.add(next.caseId);
        picked.push(next);
        progressed = true;
        break;
      }
      if (picked.length >= target) break;
    }
    if (!progressed) break;
  }
  return picked;
}

export function assignSplits(cases, {
  seed = 0x5c4010,
  discovery = 0.6,
  development = 0.2,
  holdout = 0.2,
} = {}) {
  const shuffled = seededShuffle(cases || [], `splits:${seed}`);
  const n = shuffled.length;
  let nDisc = Math.round(n * discovery);
  let nDev = Math.round(n * development);
  let nHold = n - nDisc - nDev;
  if (nHold < 0) {
    nDev = Math.max(0, nDev + nHold);
    nHold = n - nDisc - nDev;
  }
  if (nHold < Math.round(n * holdout) && nDisc > 0 && nHold + nDisc > 0) {
    // keep the requested holdout share when rounding would steal it
  }
  return Object.freeze({
    discovery: Object.freeze(shuffled.slice(0, nDisc)),
    development: Object.freeze(shuffled.slice(nDisc, nDisc + nDev)),
    holdout: Object.freeze(shuffled.slice(nDisc + nDev)),
  });
}

export function splitOfCase(caseId, splits) {
  if ((splits.holdout || []).some((c) => (c.caseId || c.frozen?.caseId) === caseId)) return 'holdout';
  if ((splits.development || []).some((c) => (c.caseId || c.frozen?.caseId) === caseId)) return 'development';
  if ((splits.discovery || []).some((c) => (c.caseId || c.frozen?.caseId) === caseId)) return 'discovery';
  return null;
}
