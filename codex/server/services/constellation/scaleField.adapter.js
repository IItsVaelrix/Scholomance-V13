/**
 * CONSTELLATION — scale field channel
 *
 * The four semantic channels, composed into one packet section:
 *
 *   wordnet-distance   structural similarity. Answers for nouns (100% of pairs)
 *                      and verbs (99.3%), abstains for adjectives (0.7%).
 *   corpus-distance    co-occurrence similarity over 150M tokens, which answers
 *                      exactly where WordNet abstains.
 *   localCosine        the same cosine inside a per-neighbourhood frame.
 *   scale-structure    whether the neighbourhood has a vertical at all, and if
 *                      so, the ordering of its members along it.
 *
 * WHY THIS IS ONE CHANNEL AND NOT FOUR. They answer one question between them —
 * "where does this word sit, and among what" — and each is defined by what the
 * others cannot do. Shipping them separately would leave a reader to join four
 * partial verdicts that were designed to compose.
 *
 * ─── WHAT IS DELIBERATELY NOT WIRED ───────────────────────────────────────
 *
 * SENSE SELECTION. Wu-Palmer was measured against the page's own sense-probe
 * seam and it fires confidently wrong: for `a wound from the battle` it ranks
 * "the act of inflicting a wound" top with a LARGER margin (0.286) than the
 * correct answer for `a wound of grief` (0.196). It measures taxonomic
 * similarity — `wound(the act)` and `battle(the act)` are sibling acts — where
 * disambiguation needs contextual relatedness. No threshold separates the two
 * cases, so the probe keeps its own gate and this channel stays out of it.
 *
 * NEAR-KIN REORDERING. Ranking leximancy's nearKin by Wu-Palmer is a no-op:
 * synonyms share a synset and every one reads 1.00. Relation buckets moved by
 * less than 0.08, which is not better than the corpus-frequency order they
 * already use. Neither was worth the risk of touching a working panel.
 *
 * @module codex/server/services/constellation/scaleField.adapter
 */

import { wordnetSimilarity, areAntonyms } from '../../../core/semantic/wordnet-distance.js';
import {
  corpusSimilarity,
  deriveLocalFrame,
  localCosine,
  rankByCorpus,
  combineVerdicts,
} from '../../../core/semantic/corpus-distance.js';
import { classifyCluster, scalesOf } from '../../../core/semantic/scale-structure.js';
import { phonotopographicSimilarity } from '../../../core/semantic/phonotopography.js';

export const SCALE_FIELD_ADAPTER_VERSION = 'scale-field-2';

const MAX_NEIGHBOURS = 12;
const MAX_LADDER = 14;

/**
 * Below this, phonotopography's per-band normalisation has collapsed and the
 * number is an artifact rather than a measurement.
 *
 * Measured: `large`/`immense` and `shadowy`/`obscure` both read exactly 0.0135,
 * while genuinely unrelated pairs read HIGHER — `cat`/`xylophone` 0.155,
 * `dog`/`strength` 0.220. A score under the floor therefore cannot be read as
 * "maximally distant"; it means the bands had nothing to compare, so it is
 * reported as null.
 */
const SOUND_FLOOR = 0.02;

/**
 * Sound distance between two words, or null when it cannot be measured.
 *
 * REQUIRES cmudict. Without it, phonotopography falls back to a spelling-derived
 * heuristic G2P, and the ranking silently becomes an ORTHOGRAPHIC one — measured,
 * the fallback ranked `shaded` first for `shadowy` (0.58) on the shared
 * "shad-" prefix, where real phonemes rank `murky` first (0.43). Returning null
 * when the dictionary is absent is the difference between no answer and a
 * confident wrong one.
 */
function soundDistance(a, b, phonologyReady) {
  if (!phonologyReady) return null;
  try {
    const s = phonotopographicSimilarity(a, b);
    if (!Number.isFinite(s) || s <= SOUND_FLOOR) return null;
    return s;
  } catch {
    return null;
  }
}

function empty(status) {
  return {
    status,
    anchor: null,
    scale: null,
    neighbours: [],
    opposites: [],
    warnings: [],
  };
}

/**
 * Pick the scale a word most plausibly sits on for THIS query.
 *
 * A word belongs to as many clusters as it has senses, and choosing wrongly is
 * not a small error: resolving `dark` to its first scalar cluster landed it on
 * a hair-colour scale, `loud` on vulgarity and `cold` on spoiled food. The
 * cluster with the most members observed in the ordering is preferred, because
 * a scale the corpus has actually measured is the one that can say anything.
 */
function selectScale(graph, word, orderedHeads) {
  const candidates = scalesOf(graph, word).filter((s) => s.kind === 'scalar');
  if (candidates.length === 0) return null;

  let best = null;
  for (const c of candidates) {
    const measured = orderedHeads?.get(c.head)?.length ?? 0;
    if (!best || measured > best.measured) best = { ...c, measured };
  }
  return best;
}

/**
 * @param {object} deps
 * @param {object} deps.wordnetGraph   from wordnetGraph.sqlite.adapter (may be an empty graph)
 * @param {object} deps.corpusVectors  from corpusVectors.sqlite.adapter (may be unavailable)
 * @param {Map<string, Array>} [deps.scaleOrders]  head -> ordered rows, from scale_order
 * @param {string} headToken
 * @param {string[]} candidateWords    words already on the page worth measuring against
 */
export function analyzeScaleField(deps, headToken, candidateWords = [], options = {}) {
  const token = String(headToken || '').trim().toLowerCase();
  if (!token) return empty('no_head_token');

  const graph = deps?.wordnetGraph;
  const vectors = deps?.corpusVectors;
  if (!graph?.stats?.available) return empty('wordnet_unavailable');

  const warnings = [];
  /**
   * The caller owns cmudict readiness because init() is async and this adapter
   * is synchronous. Passing it explicitly beats reading the engine's private
   * `_available`: a hidden global cannot be tested and fails invisibly, which
   * is the same reasoning senseProbe.harness records for its own source.
   */
  const phonologyReady = options.phonologyReady === true;
  const result = { ...empty('ok'), anchor: token };

  // ── The scale, when the neighbourhood has a vertical ────────────────────
  const picked = selectScale(graph, token, deps?.scaleOrders);
  if (picked) {
    const cluster = classifyCluster(graph, picked.head);
    const rows = deps?.scaleOrders?.get(picked.head) || [];
    /**
     * `span` travels with the ladder because scales differ enormously in
     * vertical extent — measured across the built orderings, from 1.000 down to
     * 0.062, a 16x range. A position without its span invites exactly the
     * cross-scale comparison that is meaningless.
     */
    result.scale = {
      id: picked.head,
      dimension: picked.attribute ?? null,
      kind: cluster.kind,
      memberCount: cluster.memberCount,
      span: rows.length ? rows[0].span : null,
      ladder: rows.slice(0, MAX_LADDER).map((r) => ({
        word: r.word,
        rank: r.rank,
        relative: r.relative,
        isAnchor: r.word === token,
      })),
    };
  } else {
    /**
     * Not a failure. Most neighbourhoods are flat — 14,101 clusters carry no
     * vertical against 423 that do — and saying so is the correct answer, not a
     * shortfall to be filled with a fabricated position.
     */
    result.scale = null;
  }

  // ── Neighbours: structure first, company second ─────────────────────────
  const pool = [...new Set((candidateWords || [])
    .map((w) => String(w || '').trim().toLowerCase())
    .filter((w) => w && w !== token))];

  /**
   * The local frame is derived from the SCALE when there is one, and from the
   * word's nearest corpus company otherwise. Measured, a per-neighbourhood
   * frame separates same-pole from cross-pole pairs 1.15x better than the
   * global cosine at this corpus size (2.75x at a tenth of it) — the gain
   * shrinks as evidence sharpens, which is the expected shape, not a refutation.
   */
  const frameWords = result.scale?.ladder?.length
    ? result.scale.ladder.map((l) => l.word)
    : [token, ...rankByCorpus(vectors, token, pool).slice(0, 24).map((r) => r.word)];
  const frame = vectors ? deriveLocalFrame(vectors, frameWords) : null;

  for (const other of pool) {
    const wn = wordnetSimilarity(graph, token, other);
    const cp = vectors ? corpusSimilarity(vectors, token, other) : { similarity: null, method: null };
    const local = frame ? localCosine(vectors, token, other, frame) : { similarity: null };
    const verdict = combineVerdicts(wn, cp);
    if (verdict.similarity === null) continue;   // unmeasured, never "unrelated"

    result.neighbours.push({
      word: other,
      similarity: verdict.similarity,
      source: verdict.source,
      method: verdict.method,
      // Reported alongside rather than instead — the frame sharpens a ranking,
      // it does not replace the measurement the ranking is made of.
      localSimilarity: local.similarity ?? null,
      soundSimilarity: soundDistance(token, other, phonologyReady),
    });
  }

  /**
   * SOUND IS THE TIEBREAKER, NOT THE RANKING.
   *
   * The candidate pool is leximancy's kin, which are synonyms — they share a
   * synset, so semantic similarity reads a flat 1.00 for all of them and the
   * ordering carries no information. Sound does discriminate there: measured
   * across three synonym sets the spread was 0.174 (`wound`), 0.344 (`large`)
   * and 0.418 (`shadowy`), with `murky` and `gloomy` leading for `shadowy`.
   *
   * It sorts SECOND because where semantics genuinely separates two words, that
   * separation is the more important fact. Sound decides only where meaning has
   * already collapsed, which is exactly the case this fixes.
   */
  result.neighbours.sort((a, b) => {
    const bySemantic = b.similarity - a.similarity;
    if (Math.abs(bySemantic) > 1e-9) return bySemantic;
    // Unmeasured sound sorts last rather than as zero — see SOUND_FLOOR.
    return (b.soundSimilarity ?? -1) - (a.soundSimilarity ?? -1);
  });
  result.neighbours = result.neighbours.slice(0, MAX_NEIGHBOURS);

  /**
   * Opposites are a SEPARATE channel from distance, and the measurement is why:
   * poles of one scale share nearly every context, so cosine ranks `silent` and
   * `loud` as neighbours (#64 of ~5,000). Only the antonym edge says otherwise.
   */
  for (const other of pool) {
    if (areAntonyms(graph, token, other)) result.opposites.push(other);
  }

  if (!phonologyReady) {
    warnings.push('cmudict unavailable: sound distance withheld rather than computed from spelling');
  }
  if (!vectors?.stats?.().available) {
    warnings.push('corpus vectors unavailable: adjective neighbours fall back to WordNet, which answers 0.7% of adjective pairs');
  }
  result.warnings = warnings;
  return result;
}
