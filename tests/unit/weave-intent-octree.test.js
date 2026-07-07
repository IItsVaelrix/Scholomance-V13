import { describe, expect, it } from 'vitest';
import {
  LEAVES_PER_CLASS,
  OCTANT_COUNT,
  formatIntentPath,
  getIntentClassTree,
  getIntentForest,
  listAllWeaveIntentTokens,
  listOctantsForClass,
  lookupWeaveIntent,
  resolveIntentPath,
} from '../../codex/core/weave-intent-octree.js';
import { lookupWeaveToken } from '../../codex/core/semantics.registry.js';

describe('weave intent octree forest', () => {
  it('defines five class trees with eight octants each', () => {
    const forest = getIntentForest();
    expect(forest).toHaveLength(5);
    forest.forEach((tree) => {
      expect(tree.octants).toHaveLength(OCTANT_COUNT);
      tree.octants.forEach((octant) => {
        expect(octant.leaves).toHaveLength(8);
      });
    });
  });

  it('indexes 325 unique weave intent tokens (5 roots + 320 leaves)', () => {
    const tokens = listAllWeaveIntentTokens();
    expect(tokens).toHaveLength(325);
    expect(new Set(tokens).size).toBe(325);
  });

  it('resolves coarse class roots and granular leaves to the same intent class', () => {
    expect(lookupWeaveIntent('OFFENSIVE')).toMatchObject({ intentClass: 'OFFENSIVE', path: [] });
    expect(lookupWeaveIntent('REND')).toMatchObject({ intentClass: 'OFFENSIVE', manner: 'CUT' });
    expect(lookupWeaveIntent('SANCTUARY')).toMatchObject({ intentClass: 'DEFENSIVE', manner: 'HAVEN' });
    expect(lookupWeaveIntent('MEND')).toMatchObject({ intentClass: 'HEALING', manner: 'RESTORE' });
    expect(lookupWeaveIntent('SCRY')).toMatchObject({ intentClass: 'UTILITY', manner: 'PERCEIVE' });
    expect(lookupWeaveIntent('UNWEAVE')).toMatchObject({ intentClass: 'DISRUPTION', manner: 'FRAY' });
  });

  it('walks octree paths deterministically', () => {
    const rend = resolveIntentPath('OFFENSIVE', [1, 2]);
    expect(rend?.token).toBe('REND');
    expect(formatIntentPath('REND')).toBe('OFFENSIVE/Rend/REND');
  });

  it('lists octants with token families for UI discovery', () => {
    const octants = listOctantsForClass('OFFENSIVE');
    expect(octants).toHaveLength(8);
    expect(octants[1].label).toBe('Rend');
    expect(octants[1].tokens).toContain('REND');
  });

  it('exposes every leaf through lookupWeaveToken as INTENT', () => {
    const tree = getIntentClassTree('HEALING');
    const sample = tree.octants[0].leaves[0].token;
    expect(lookupWeaveToken(sample)).toMatchObject({
      type: 'INTENT',
      intentClass: 'HEALING',
    });
  });

  it('maps legacy predicate verbs that appear as octree leaves', () => {
    expect(lookupWeaveIntent('STRIKE')).toMatchObject({ intentClass: 'OFFENSIVE', manner: 'KINETIC' });
    expect(lookupWeaveIntent('IGNITE')).toMatchObject({ intentClass: 'OFFENSIVE', manner: 'FLAME' });
  });

  it('covers 64 leaves per class', () => {
    const offensive = listOctantsForClass('OFFENSIVE').flatMap((octant) => octant.tokens);
    expect(offensive).toHaveLength(LEAVES_PER_CLASS);
  });
});