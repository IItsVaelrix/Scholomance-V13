import { describe, it, expect } from 'vitest';
import { wordnetSimilarity, areAntonyms } from '../../../codex/core/semantic/wordnet-distance.js';

/**
 * A hand-built graph, so these tests assert the METRIC rather than the contents
 * of scholomance_dict.sqlite. Shapes mirror the real loader exactly.
 *
 *   entity
 *     └── animal ── dog, wolf
 *     └── mineral ── granite
 *
 * Adjectives use WordNet's real topology: satellites hanging off a head synset,
 * with no hypernym chain of their own.
 */
function graph() {
  const m = (pairs) => new Map(pairs);
  return {
    sensesOf: m([
      ['dog', ['s.dog']], ['wolf', ['s.wolf']], ['granite', ['s.granite']],
      ['puppy', ['s.dog']],
      ['shadowy', ['a.shadowy']], ['murky', ['a.murky']], ['dusky', ['a.dusky']],
      ['hot', ['a.hot']], ['cold', ['a.cold']],
    ]),
    hypernymsOf: m([
      ['s.dog', ['s.animal']],
      ['s.wolf', ['s.animal']],
      ['s.animal', ['s.entity']],
      ['s.granite', ['s.mineral']],
      ['s.mineral', ['s.entity']],
    ]),
    relatedOf: new Map(),
    posOf: m([
      ['s.dog', 'n'], ['s.wolf', 'n'], ['s.granite', 'n'],
      ['s.animal', 'n'], ['s.mineral', 'n'], ['s.entity', 'n'],
      ['a.shadowy', 's'], ['a.murky', 's'], ['a.dusky', 's'],
      ['a.hot', 's'], ['a.cold', 's'], ['head.dark', 'a'], ['head.twilight', 'a'],
    ]),
    // shadowy and murky share a head; dusky sits in a different cluster.
    headsOf: m([
      ['a.shadowy', ['head.dark']],
      ['a.murky', ['head.dark']],
      ['a.dusky', ['head.twilight']],
    ]),
    antonymsOf: m([
      ['a.hot', ['a.cold']], ['a.cold', ['a.hot']],
      // HEAD-level antonymy, the shape WordNet actually uses for adjectives:
      // the opposition is recorded between cluster heads, never between the
      // satellites that carry the lemmas.
      ['head.dark', ['head.light']],
    ]),
  };
}

/** Adds a lit cluster opposite head.dark, reachable only through the heads. */
function graphWithPoles() {
  const g = graph();
  g.sensesOf.set('lucent', ['a.lucent']);
  g.posOf.set('a.lucent', 's');
  g.posOf.set('head.light', 'a');
  g.headsOf.set('a.lucent', ['head.light']);
  return g;
}

describe('wordnetSimilarity', () => {
  it('reads a shared synset as identity', () => {
    const r = wordnetSimilarity(graph(), 'dog', 'puppy');
    expect(r.method).toBe('identity');
    expect(r.similarity).toBe(1);
  });

  it('scores siblings under a deep subsumer above pairs that meet at the root', () => {
    const g = graph();
    const siblings = wordnetSimilarity(g, 'dog', 'wolf');
    const acrossTree = wordnetSimilarity(g, 'dog', 'granite');
    expect(siblings.method).toBe('wu-palmer');
    expect(siblings.similarity).toBeGreaterThan(acrossTree.similarity);
  });

  /**
   * The hub-shortcut failure this metric exists to avoid. Measured on the real
   * dictionary, raw path length put `granite` exactly 8 hops from `shadowy` —
   * tied with `gloomy`, a genuine neighbour — because paths route through
   * high-degree synsets like "city" (665 edges). Wu-Palmer reads the depth of
   * the subsumer instead, so meeting only at the root scores near zero.
   */
  it('does not reward a short path that only meets at the root', () => {
    const r = wordnetSimilarity(graph(), 'dog', 'granite');
    expect(r.similarity).toBeLessThan(0.5);
  });

  it('treats adjectives sharing a head cluster as related', () => {
    const r = wordnetSimilarity(graph(), 'shadowy', 'murky');
    expect(r.method).toBe('adjective-cluster');
    expect(r.similarity).toBeGreaterThan(0);
  });

  /**
   * ABSTENTION IS THE POINT. WordNet's adjective clusters are islands — 7,502
   * head synsets carrying 2,709 head-to-head edges, 0.36 per cluster. `shadowy`
   * and `dusky` are close in English and sit in different islands, so the graph
   * has no opinion. A number here would be invented evidence; null lets the
   * caller fall through to a channel that knows.
   */
  it('returns null, not a small number, for adjectives in different clusters', () => {
    const r = wordnetSimilarity(graph(), 'shadowy', 'dusky');
    expect(r.similarity).toBeNull();
    expect(r.method).toBeNull();
  });

  it('reports an unknown word as unmeasured rather than unrelated', () => {
    const r = wordnetSimilarity(graph(), 'dog', 'zzzznotaword');
    expect(r.similarity).toBeNull();
  });

  it('never walks antonym edges as distance', () => {
    // hot/cold are one antonym hop apart and maximally opposite. Distance must
    // not see that edge at all.
    const r = wordnetSimilarity(graph(), 'hot', 'cold');
    expect(r.similarity).toBeNull();
    expect(areAntonyms(graph(), 'hot', 'cold')).toBe(true);
  });

  it('keeps oppositeness on its own channel', () => {
    expect(areAntonyms(graph(), 'dog', 'wolf')).toBe(false);
  });

  /**
   * MEASURED MISS. A satellite-only antonym test reported `bright`/`dark`,
   * `fierce`/`gentle` and every other adjective pair as not-opposites, because
   * WordNet records adjective antonymy between cluster HEADS. `shadowy` and
   * `lucent` here carry no antonym edge of their own; the opposition lives one
   * hop up, on head.dark → head.light.
   *
   * This is the channel that has to catch poles of one scale, since they share
   * nearly every context and co-occurrence ranks them as neighbours.
   */
  it('finds antonymy recorded between cluster heads, not just satellites', () => {
    const g = graphWithPoles();
    expect(areAntonyms(g, 'shadowy', 'lucent')).toBe(true);
    // ...and the satellites themselves still carry no antonym edge.
    expect(g.antonymsOf.get('a.shadowy')).toBeUndefined();
  });

  it('finds head antonymy from either direction', () => {
    const g = graphWithPoles();
    expect(areAntonyms(g, 'lucent', 'shadowy')).toBe(true);
  });

  it('does not call same-cluster words opposites', () => {
    expect(areAntonyms(graphWithPoles(), 'shadowy', 'murky')).toBe(false);
  });
});
