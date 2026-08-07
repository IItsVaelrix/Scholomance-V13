import { describe, it, expect } from 'vitest';
import {
  classifyCluster,
  scalesOf,
  admitsDegree,
  orderScale,
} from '../../../codex/core/semantic/scale-structure.js';

/**
 * Hand-built graph mirroring the real loader's shape.
 *
 *   head.dark   scalar        an attribute noun names the dimension
 *   head.hue    unstructured  many members, no attribute: a palette
 *   head.alone  singleton     one member, nothing to order
 *   head.shape  unstructured  an opposite but no named dimension: a binary
 */
function graph() {
  const m = (p) => new Map(p);
  return {
    sensesOf: m([
      ['dim', ['a.dim']], ['dark', ['a.dark']], ['black', ['a.black']],
      ['blue', ['a.blue']], ['red', ['a.red']], ['green', ['a.green']],
      ['unique', ['a.unique']],
      ['round', ['a.round']], ['square', ['a.square']],
    ]),
    posOf: m([['a.dim', 's'], ['a.dark', 's'], ['a.black', 's'], ['a.blue', 's'],
      ['a.red', 's'], ['a.green', 's'], ['a.unique', 's'], ['a.round', 's'], ['a.square', 's']]),
    headsOf: m([
      ['a.dim', ['head.dark']], ['a.dark', ['head.dark']], ['a.black', ['head.dark']],
      ['a.blue', ['head.hue']], ['a.red', ['head.hue']], ['a.green', ['head.hue']],
      ['a.unique', ['head.alone']],
      ['a.round', ['head.shape']], ['a.square', ['head.shape']],
    ]),
    clusterMembers: m([
      ['head.dark', new Set(['dim', 'dark', 'black'])],
      ['head.hue', new Set(['blue', 'red', 'green'])],
      ['head.alone', new Set(['unique'])],
      ['head.shape', new Set(['round', 'square'])],
    ]),
    // Only head.dark has a named dimension.
    attributeOf: m([['head.dark', ['n.lightness']]]),
    antonymsOf: m([['head.dark', ['head.light']], ['head.shape', ['head.formless']]]),
    hypernymsOf: new Map(),
    relatedOf: new Map(),
  };
}

describe('classifyCluster', () => {
  /**
   * The signal is WordNet's `attribute` relation, not any corpus statistic.
   * Two statistical discriminators were measured and rejected first: the
   * fraction of gradable members (hue read 0.90 against dark's 1.00 — polysemy
   * defeats it) and the spread of members' intensifier profiles (scalar `good`
   * sd 0.119 sat below categorical `shape` sd 0.260 — no threshold separates).
   */
  it('calls a cluster with a named attribute dimension scalar', () => {
    const c = classifyCluster(graph(), 'head.dark');
    expect(c.kind).toBe('scalar');
    expect(c.attribute).toBe('n.lightness');
  });

  /**
   * `blue` is not a stronger `red`. The largest WordNet adjective clusters are
   * the FLATTEST — 389 "numerical quantity", 267 "hue", 184 "numerical order" —
   * so member count is emphatically not scale height.
   */
  it('calls a many-membered cluster with no attribute unstructured', () => {
    const c = classifyCluster(graph(), 'head.hue');
    expect(c.kind).toBe('unstructured');
    expect(c.memberCount).toBe(3);
  });

  it('calls a one-member cluster a singleton', () => {
    // Half of all 14,716 real clusters are this: nothing to order.
    expect(classifyCluster(graph(), 'head.alone').kind).toBe('singleton');
  });

  /**
   * AN ANTONYM ALONE IS NOT A SCALE. This case previously returned a `polar`
   * kind that admitted degree, and the measurement showed that hedge was wrong:
   * the largest such clusters were "numerical quantity" (361), "numerical
   * order" (184), "form or shape" (87) and "covered with leaves" (42) — all
   * flat. `shaped`/`shapeless` is presence against absence with no middle,
   * unlike `hot`/`cold` which has `warm` between.
   */
  it('does not call an opposed cluster a scale when no pole names a dimension', () => {
    expect(classifyCluster(graph(), 'head.shape').kind).toBe('unstructured');
    expect(admitsDegree(graph(), 'round', 'head.shape')).toBe(false);
  });

  /**
   * WordNet labels the axis on only one end of an opposed pair, so requiring
   * the link on this pole discarded real scales — `not having a sharp edge` is
   * bare while its opposite `having a thin edge or sharp point` carries it.
   */
  it('accepts a dimension named on the opposite pole', () => {
    const g = graph();
    g.attributeOf = new Map([['head.light', ['n.lightness']]]);
    g.antonymsOf = new Map([['head.dark', ['head.light']]]);
    const c = classifyCluster(g, 'head.dark');
    expect(c.kind).toBe('scalar');
    expect(c.attributeVia).toBe('opposite');
  });
});

describe('admitsDegree', () => {
  it('admits a member of a scalar cluster', () => {
    expect(admitsDegree(graph(), 'dim', 'head.dark')).toBe(true);
  });

  it('refuses a member of an unstructured cluster', () => {
    expect(admitsDegree(graph(), 'blue', 'head.hue')).toBe(false);
  });

  it('refuses a singleton', () => {
    expect(admitsDegree(graph(), 'unique', 'head.alone')).toBe(false);
  });

  /**
   * THE CLUSTER ARGUMENT IS LOAD-BEARING. A word-level version of this returned
   * true for `blue`, `crimson`, `impossible` and `unknown`, because across all
   * its senses nearly every word touches some scale; and resolving a word to
   * its "first scalar cluster" sent `dark` to a hair-colour scale, `loud` to
   * vulgarity and `cold` to spoiled food. A word is not on a scale — a word in
   * a sense is.
   */
  it('refuses a word that is not in the named cluster', () => {
    expect(admitsDegree(graph(), 'blue', 'head.dark')).toBe(false);
  });
});

describe('scalesOf', () => {
  it('reports every cluster a word belongs to', () => {
    const ss = scalesOf(graph(), 'dim');
    expect(ss).toHaveLength(1);
    expect(ss[0].kind).toBe('scalar');
  });

  it('returns empty for an unplaced word rather than guessing', () => {
    expect(scalesOf(graph(), 'nonexistent')).toEqual([]);
  });
});

describe('orderScale', () => {
  const degrees = new Map([['dim', 0.2], ['dark', 0.5], ['black', 0.9]]);

  it('orders members within the scale', () => {
    const o = orderScale(graph(), 'head.dark', degrees);
    expect(o.ordered.map((x) => x.word)).toEqual(['dim', 'dark', 'black']);
    expect(o.ordered[0].relative).toBe(0);
    expect(o.ordered[2].relative).toBe(1);
  });

  /**
   * ADAPTABLE HEIGHT. Scales differ enormously in vertical extent — measured on
   * the real data, span was 0.345 for the dark cluster, 0.708 for large and
   * 0.833 for hot. Flattening all three to [0,1] asserts they cover the same
   * distance, which is exactly the claim that is false.
   */
  it('reports the scale span so callers cannot compare across scales blindly', () => {
    const o = orderScale(graph(), 'head.dark', degrees);
    expect(o.span).toBeCloseTo(0.7, 6);
  });

  it('refuses to order an unstructured cluster', () => {
    const o = orderScale(graph(), 'head.hue', new Map([['blue', 0.3], ['red', 0.6]]));
    expect(o.ordered).toEqual([]);
    expect(o.span).toBeNull();
  });

  it('omits unmeasured members rather than sorting them to the bottom', () => {
    const o = orderScale(graph(), 'head.dark', new Map([['dim', 0.2], ['black', 0.9]]));
    expect(o.ordered.map((x) => x.word)).toEqual(['dim', 'black']);
  });
});
