/**
 * Map a gold label onto Type I–IV.
 *
 * Type IV is unused existing evidence, not a new predicate.
 *
 * @module codex/research/semantic-adjudication/classify-hole
 */

import { glossOverlapCount } from '../../core/semantic-calculus/hypothesisStatus.js';
import { isGoldRefusal } from './adjudication-schema.js';
import { contextTokensOf } from './util.js';

function packetContext(packet) {
  const fromIdentity = contextTokensOf(packet.identity);
  if (fromIdentity.length) return fromIdentity;
  const obs = (packet.probe?.observations || []).find((o) => o.observationId === 'obs.lex.sense_candidates');
  return Array.isArray(obs?.result?.queryTokens) ? obs.result.queryTokens : [];
}

/**
 * Distinctions already present in frame / gloss overlap / morphology /
 * lexical metadata that the probe failed to consume.
 */
export function unusedExistingEvidence(packet, goldSenseId) {
  const unused = [];
  const candidates = packet?.candidateSenses || [];
  const gold = candidates.find((c) => c.senseId === goldSenseId);
  if (!gold) return unused;

  const context = packetContext(packet);
  const overlaps = candidates.map((c) => ({
    id: c.senseId,
    n: glossOverlapCount(c.gloss, context),
  }));
  const max = overlaps.reduce((m, o) => Math.max(m, o.n), 0);
  const winners = overlaps.filter((o) => o.n === max && o.n > 0);
  if (winners.length === 1 && winners[0].id === goldSenseId) {
    unused.push(Object.freeze({ kind: 'gloss_overlap', detail: `unique overlap ${max}` }));
  }

  const framePos = packet.frameEvidence?.framePos;
  if (framePos) {
    const goldMatches = gold.pos === framePos;
    const competitorMatches = candidates.some((c) => c.senseId !== goldSenseId && c.pos === framePos);
    if (goldMatches && !competitorMatches) {
      unused.push(Object.freeze({ kind: 'frame_pos', detail: framePos }));
    }
  }

  if (packet.probe?.status === 'heteronym_unresolved' && packet.frameEvidence?.viableWordCount === 1) {
    unused.push(Object.freeze({ kind: 'word_settled', detail: 'viableWordCount=1' }));
  }

  return unused;
}

export function classifyHole({ frozen, gold } = {}) {
  if (gold === 'NONE_OF_THE_ABOVE' || gold === 'BAD_CANDIDATE_SET') {
    return 'TYPE_III_CANDIDATE_GENERATION';
  }
  if (gold === 'AMBIGUOUS' || gold === 'INSUFFICIENT_CONTEXT') {
    return 'TYPE_II_BALLISTICS_ARTIFACT';
  }
  if (isGoldRefusal(gold)) return 'TYPE_II_BALLISTICS_ARTIFACT';
  if (unusedExistingEvidence(frozen, gold).length > 0) return 'TYPE_IV_UNUSED_EVIDENCE';
  return 'TYPE_I_PROBE_HOLE';
}
