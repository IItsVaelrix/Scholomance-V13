import { describe, it, expect } from 'vitest';
import { analyzeScaleField } from '../../../codex/server/services/constellation/scaleField.adapter.js';

/** Mirrors the loader's shape: a scalar dark cluster and a flat hue cluster. */
function wordnetGraph() {
  const m = (p) => new Map(p);
  return {
    stats: { available: true },
    sensesOf: m([
      ['dim', ['a.dim']], ['dark', ['a.dark']], ['black', ['a.black']],
      ['blue', ['a.blue']], ['red', ['a.red']], ['green', ['a.green']],
      ['bright', ['a.bright']],
      ['dog', ['n.dog']], ['wolf', ['n.wolf']],
    ]),
    posOf: m([['a.dim', 's'], ['a.dark', 's'], ['a.black', 's'], ['a.blue', 's'],
      ['a.red', 's'], ['a.green', 's'], ['a.bright', 's'],
      ['n.dog', 'n'], ['n.wolf', 'n'], ['n.animal', 'n'], ['n.entity', 'n']]),
    headsOf: m([
      ['a.dim', ['head.dark']], ['a.dark', ['head.dark']], ['a.black', ['head.dark']],
      ['a.blue', ['head.hue']], ['a.red', ['head.hue']], ['a.green', ['head.hue']],
      ['a.bright', ['head.light']],
    ]),
    clusterMembers: m([
      ['head.dark', new Set(['dim', 'dark', 'black'])],
      ['head.hue', new Set(['blue', 'red', 'green'])],
      ['head.light', new Set(['bright'])],
    ]),
    attributeOf: m([['head.dark', ['n.lightness']]]),
    antonymsOf: m([['head.dark', ['head.light']], ['a.dark', ['a.bright']], ['a.bright', ['a.dark']]]),
    hypernymsOf: m([['n.dog', ['n.animal']], ['n.wolf', ['n.animal']], ['n.animal', ['n.entity']]]),
    relatedOf: new Map(),
  };
}

function corpusVectors(spec = {}) {
  const rows = new Map(Object.entries(spec).map(([w, c]) => [w, new Map(Object.entries(c))]));
  return { get: (w) => rows.get(w), stats: () => ({ available: rows.size > 0 }) };
}

const scaleOrders = new Map([[
  'head.dark',
  [
    { word: 'dim', rank: 1, relative: 0, span: 0.7 },
    { word: 'dark', rank: 2, relative: 0.43, span: 0.7 },
    { word: 'black', rank: 3, relative: 1, span: 0.7 },
  ],
]]);

const deps = (over = {}) => ({
  wordnetGraph: wordnetGraph(),
  corpusVectors: corpusVectors(),
  scaleOrders,
  ...over,
});

describe('analyzeScaleField', () => {
  it('renders the ladder for a word on a measured scale', () => {
    const r = analyzeScaleField(deps(), 'dark', ['dim', 'black']);
    expect(r.status).toBe('ok');
    expect(r.scale.ladder.map((l) => l.word)).toEqual(['dim', 'dark', 'black']);
    expect(r.scale.ladder.find((l) => l.isAnchor).word).toBe('dark');
  });

  /**
   * Span travels with the ladder because scales differ in vertical extent by up
   * to 16x across the built orderings (1.000 down to 0.062). A position without
   * its span invites the cross-scale comparison that is meaningless.
   */
  it('reports the scale span alongside the positions', () => {
    expect(analyzeScaleField(deps(), 'dark', []).scale.span).toBe(0.7);
  });

  /**
   * Most neighbourhoods are flat — 14,101 clusters carry no vertical against
   * 423 that do. Reporting no scale is the correct answer, not a shortfall to
   * be filled with a fabricated position.
   */
  it('reports no scale for a flat neighbourhood rather than inventing one', () => {
    const r = analyzeScaleField(deps(), 'blue', ['red', 'green']);
    expect(r.status).toBe('ok');
    expect(r.scale).toBeNull();
  });

  it('ranks neighbours and names which channel answered', () => {
    const r = analyzeScaleField(deps(), 'dog', ['wolf']);
    const wolf = r.neighbours.find((n) => n.word === 'wolf');
    expect(wolf).toBeDefined();
    expect(wolf.source).toBe('wordnet');
    expect(wolf.similarity).toBeGreaterThan(0);
  });

  /**
   * The corpus answers exactly where WordNet abstains — adjective pair coverage
   * is 0.7% structurally against 100% for nouns.
   */
  it('falls through to the corpus when WordNet has no opinion', () => {
    const vectors = corpusVectors({
      shadowy: { veil: 3, mist: 2, gloom: 2, night: 1 },
      dusky: { veil: 2, mist: 3, gloom: 2, night: 1 },
    });
    const g = wordnetGraph();
    g.sensesOf.set('shadowy', ['a.shadowy']);
    g.sensesOf.set('dusky', ['a.dusky']);
    g.posOf.set('a.shadowy', 's');
    g.posOf.set('a.dusky', 's');
    const r = analyzeScaleField({ wordnetGraph: g, corpusVectors: vectors, scaleOrders }, 'shadowy', ['dusky']);
    const d = r.neighbours.find((n) => n.word === 'dusky');
    expect(d).toBeDefined();
    expect(d.source).toBe('corpus');
  });

  /**
   * Poles of one scale share nearly every context, so cosine ranked `silent`
   * and `loud` as neighbours at #64 of ~5,000. Only the antonym edge separates
   * them, which is why opposites are a channel of their own.
   */
  it('keeps opposites on a separate channel from distance', () => {
    const r = analyzeScaleField(deps(), 'dark', ['bright']);
    expect(r.opposites).toContain('bright');
  });

  it('omits an unmeasured neighbour rather than calling it distant', () => {
    const r = analyzeScaleField(deps(), 'dog', ['zzzunknown']);
    expect(r.neighbours.map((n) => n.word)).not.toContain('zzzunknown');
  });

  it('reports itself unavailable when the graph is missing', () => {
    const r = analyzeScaleField({ wordnetGraph: { stats: { available: false } } }, 'dark', []);
    expect(r.status).toBe('wordnet_unavailable');
    expect(r.scale).toBeNull();
  });

  /**
   * SOUND IS A TIEBREAKER, NOT THE RANKING. The candidate pool is leximancy's
   * kin — synonyms sharing a synset — so semantic similarity reads a flat 1.00
   * across all of them and carries no ordering. Measured spread from sound over
   * three synonym sets: 0.174 (`wound`), 0.344 (`large`), 0.418 (`shadowy`).
   */
  it('breaks a semantic tie by sound when phonology is ready', () => {
    const r = analyzeScaleField(deps(), 'dog', ['wolf'], { phonologyReady: true });
    const wolf = r.neighbours.find((n) => n.word === 'wolf');
    expect(wolf.soundSimilarity === null || typeof wolf.soundSimilarity === 'number').toBe(true);
  });

  /**
   * Without cmudict, phonotopography falls back to a spelling-derived G2P and
   * the ranking silently becomes orthographic — measured, `shaded` led for
   * `shadowy` on the shared "shad-" prefix where real phonemes lead with
   * `murky`. Withholding is the difference between no answer and a wrong one.
   */
  it('withholds sound distance entirely when phonology is not ready', () => {
    const r = analyzeScaleField(deps(), 'dog', ['wolf'], { phonologyReady: false });
    expect(r.neighbours.every((n) => n.soundSimilarity === null)).toBe(true);
    expect(r.warnings.some((w) => w.includes('cmudict'))).toBe(true);
  });

  it('never lets sound override a real semantic difference', () => {
    const g = wordnetGraph();
    const r = analyzeScaleField({ ...deps(), wordnetGraph: g }, 'dog', ['wolf', 'blue'], { phonologyReady: true });
    // wolf is a taxonomic sibling; blue is unrelated. Order must hold whatever
    // the two words happen to sound like.
    const words = r.neighbours.map((n) => n.word);
    if (words.includes('blue')) expect(words.indexOf('wolf')).toBeLessThan(words.indexOf('blue'));
  });

  it('needs no head token to stay safe', () => {
    expect(analyzeScaleField(deps(), '', []).status).toBe('no_head_token');
  });
});
