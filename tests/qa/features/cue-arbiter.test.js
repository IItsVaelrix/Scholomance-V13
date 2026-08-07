import { describe, it, expect } from 'vitest';
import { arbitrate, support, veto, abstain } from '../../../codex/core/constellation/cue-arbiter.js';

describe('arbitrate', () => {
  it('picks the highest-precedence supporter and names it', () => {
    const r = arbitrate([support('low', 'a', 1), support('high', 'b', 10)]);
    expect(r.decided).toBe(true);
    expect(r.decidedBy).toBe('high');
    expect(r.payload).toBe('b');
  });

  /**
   * A veto encodes structural impossibility, not low confidence. A determiner
   * between an adjective and a noun does not make attributive attachment
   * unlikely — it makes it ungrammatical — so no weight of support outranks it.
   */
  it('lets a veto beat any amount of support', () => {
    const r = arbitrate([support('strong', 'x', 999), veto('determiner-barrier')]);
    expect(r.decided).toBe(false);
    expect(r.vetoedBy).toBe('determiner-barrier');
    expect(r.payload).toBeNull();
  });

  /**
   * Checked before supporters are ranked. Ranking first and then testing the
   * winner is the ordering error that let an under-evidenced candidate occupy
   * the top slot and veto a whole decision in governed-sense.
   */
  it('applies the veto regardless of declaration order', () => {
    expect(arbitrate([veto('v'), support('s', 1, 5)]).vetoedBy).toBe('v');
    expect(arbitrate([support('s', 1, 5), veto('v')]).vetoedBy).toBe('v');
  });

  /** Abstention is not a vote, and never counts as evidence against. */
  it('treats abstention as contributing nothing', () => {
    const r = arbitrate([abstain('quiet'), support('speaks', 'p', 1)]);
    expect(r.decidedBy).toBe('speaks');
    expect(r.abstained).toEqual(['quiet']);
  });

  it('decides nothing when every cue abstains', () => {
    const r = arbitrate([abstain('a'), abstain('b')]);
    expect(r.decided).toBe(false);
    expect(r.decidedBy).toBeNull();
    expect(r.vetoedBy).toBeNull();
  });

  it('reports every supporter, ranked, not only the winner', () => {
    const r = arbitrate([support('mid', null, 5), support('top', null, 9), support('low', null, 1)]);
    expect(r.supported).toEqual(['top', 'mid', 'low']);
  });

  it('survives an empty or malformed cue list', () => {
    expect(arbitrate([]).decided).toBe(false);
    expect(arbitrate(null).decided).toBe(false);
    expect(arbitrate([null, undefined]).decided).toBe(false);
  });
});
