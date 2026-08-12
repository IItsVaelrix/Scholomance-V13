import { describe, it, expect } from 'vitest';
import {
  topologyKey,
  jaccard,
  shuffleOffersSeeks,
  shuffleEvidencePaths,
  mulberry32,
  randomTopologyMatchedControls,
} from '../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

describe('codebase-nuclei-bank helpers', () => {
  it('topologyKey sorts atom ids', () => {
    expect(topologyKey(['b', 'a'])).toBe('a|b');
  });

  it('jaccard is 1 for identical sets and 0 for disjoint', () => {
    expect(jaccard(['a', 'b'], ['b', 'a'])).toBe(1);
    expect(jaccard(['a'], ['b'])).toBe(0);
  });

  it('shuffleOffersSeeks is a derangement of port pairs (deterministic)', () => {
    const bank = [
      { id: 'a', offers: ['x'], seeks: ['y'], evidence: ['e1'] },
      { id: 'b', offers: ['p'], seeks: ['q'], evidence: ['e2'] },
      { id: 'c', offers: ['m'], seeks: ['n'], evidence: ['e3'] },
    ];
    const once = shuffleOffersSeeks(bank, 42);
    const twice = shuffleOffersSeeks(bank, 42);
    expect(once).toEqual(twice);
    // ids and evidence preserved
    expect(once.map((a) => a.id)).toEqual(['a', 'b', 'c']);
    expect(once.map((a) => a.evidence[0])).toEqual(['e1', 'e2', 'e3']);
    // at least one atom has different ports than original
    const moved = once.some((a, i) => (
      JSON.stringify(a.offers) !== JSON.stringify(bank[i].offers)
      || JSON.stringify(a.seeks) !== JSON.stringify(bank[i].seeks)
    ));
    expect(moved).toBe(true);
  });

  it('shuffleEvidencePaths preserves ports and deranges paths', () => {
    const bank = [
      { id: 'a', offers: ['x'], seeks: [], evidence: ['e1'] },
      { id: 'b', offers: ['y'], seeks: [], evidence: ['e2'] },
    ];
    const out = shuffleEvidencePaths(bank, 7);
    expect(out[0].offers).toEqual(['x']);
    expect(out.map((a) => a.evidence[0]).sort()).toEqual(['e1', 'e2']);
    expect(out[0].evidence[0]).not.toBe('e1'); // 2-cycle derangement
  });

  it('randomTopologyMatchedControls never clones the proposal topology', () => {
    const proposals = [{ topology: 'a|b', atomIds: ['a', 'b'] }];
    const controls = randomTopologyMatchedControls(
      proposals,
      ['a', 'b', 'c', 'd', 'e'],
      99,
      5,
    );
    expect(controls.length).toBeGreaterThan(0);
    for (const c of controls) {
      expect(c.topology).not.toBe('a|b');
      expect(c.size).toBe(2);
    }
  });

  it('mulberry32 is deterministic', () => {
    const a = mulberry32(1);
    const b = mulberry32(1);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});
