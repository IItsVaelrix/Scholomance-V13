/* @vitest-environment node */
/**
 * SUBSTRATE BENCHMARK GATE
 *
 * The substrate exists to replace a measured deficiency: production's adjective
 * similarity comes from WordNet alone, which answers 41% of labelled pairs and
 * ranks synonym-vs-unrelated at AUC 0.696.
 *
 * This gate asserts the substrate BEATS PRODUCTION on the same pairs through
 * the same functions production calls. It deliberately does not assert absolute
 * thresholds alone — an absolute floor can be met by a substrate that is worse
 * than what it replaced, which is exactly the failure mode worth catching.
 *
 * Labels in tests/fixtures/adjective-pairs.json are authored linguistic
 * judgement, independent of both PPMI and WordNet. They are NOT a human-rated
 * gold standard; treat the margins as indicative and the ORDERING as the claim.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdjectiveSubstrate } from '../../../codex/server/adapters/adjectiveSubstrate.adapter.js';
import { loadWordnetGraph } from '../../../codex/server/adapters/wordnetGraph.sqlite.adapter.js';
import { wordnetSimilarity } from '../../../codex/core/semantic/wordnet-distance.js';
import { corpusSimilarity } from '../../../codex/core/semantic/corpus-distance.js';

const PAIRS = JSON.parse(readFileSync(join('tests', 'fixtures', 'adjective-pairs.json'), 'utf8'));
const DICT = 'scholomance_dict.sqlite';
const ANTONYM_VETO = 0.5;

const mean = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
function auc(pos, neg) {
  if (!pos.length || !neg.length) return null;
  let wins = 0;
  for (const p of pos) for (const q of neg) wins += p > q ? 1 : (p === q ? 0.5 : 0);
  return wins / (pos.length * neg.length);
}
function score(fn) {
  const buckets = { SYNONYM: [], UNRELATED: [], ANTONYM: [] };
  let answered = 0;
  for (const [a, b, type] of PAIRS.pairs) {
    let v = null;
    try { v = fn(a, b); } catch { v = null; }
    if (v !== null && Number.isFinite(v)) { answered += 1; buckets[type].push(v); }
  }
  return {
    coverage: answered / PAIRS.pairs.length,
    aucSynUnrel: auc(buckets.SYNONYM, buckets.UNRELATED),
    aucSynAnto: auc(buckets.SYNONYM, buckets.ANTONYM),
    means: { syn: mean(buckets.SYNONYM), unrel: mean(buckets.UNRELATED), anto: mean(buckets.ANTONYM) },
  };
}

const haveSubstrate = existsSync(join('public', 'substrate', 'adjective-substrate.bin'));
const haveDict = existsSync(DICT);

describe.runIf(haveSubstrate && haveDict)('adjective substrate vs production', () => {
  const substrate = createAdjectiveSubstrate({ dir: join('public', 'substrate') });
  const graph = loadWordnetGraph(DICT);

  const production = (a, b) => {
    const r = wordnetSimilarity(graph, a, b);
    return typeof r === 'number' ? r : (r?.similarity ?? null);
  };
  const withVeto = (a, b) => {
    const c = corpusSimilarity(substrate, a, b).similarity;
    if (c === null) return production(a, b);
    return c - ANTONYM_VETO * substrate.antonymCharge(a, b);
  };

  it('loads and matches the committed corpus checksum', () => {
    expect(substrate.available).toBe(true);
    // If the corpus is rebuilt, this changes and the substrate must be rebuilt
    // with it. A silent mismatch would serve vectors for a different corpus.
    expect(substrate.stats().corpusChecksum).toBe('2e1020f3b8b57274');
    expect(substrate.stats().words).toBe(13571);
    expect(substrate.stats().dims).toBe(128);
  });

  it('answers far more pairs than the WordNet fallback it supplements', () => {
    const prod = score(production);
    const ours = score(withVeto);
    expect(prod.coverage).toBeLessThan(0.5);        // the deficiency being fixed
    expect(ours.coverage).toBeGreaterThan(0.95);
    expect(ours.coverage).toBeGreaterThan(prod.coverage * 2);
  });

  it('ranks synonyms above unrelated words far better than production', () => {
    const prod = score(production);
    const ours = score(withVeto);
    expect(ours.aucSynUnrel).toBeGreaterThan(prod.aucSynUnrel);
    expect(ours.aucSynUnrel).toBeGreaterThan(0.97);
  });

  /**
   * The load-bearing one. A distributional cosine rates opposites as SIMILAR
   * because opposites share contexts — measured, the raw substrate scores 0.642
   * here and the full 6.3GB PPMI matrix scores 0.435, BELOW chance. WordNet's
   * typed antonym edges are the only thing that fixes it, and wiring the
   * substrate WITHOUT the veto would regress production's 0.911.
   */
  it('does not regress antonym discrimination — the veto is required', () => {
    const prod = score(production);
    const noVeto = score((a, b) => corpusSimilarity(substrate, a, b).similarity);
    const ours = score(withVeto);

    expect(noVeto.aucSynAnto).toBeLessThan(prod.aucSynAnto); // without it, a regression
    expect(ours.aucSynAnto).toBeGreaterThan(prod.aucSynAnto); // with it, an improvement
    expect(ours.aucSynAnto).toBeGreaterThan(0.90);
  });

  it('keeps antonyms below synonyms on the raw means, not just in ranking', () => {
    const ours = score(withVeto);
    expect(ours.means.anto).toBeLessThan(ours.means.syn);
    expect(ours.means.unrel).toBeLessThan(ours.means.syn);
  });
});
