/**
 * Silicone superposition + collapse.
 *
 * Production change that would make these fail: using gold to set weights,
 * collapsing a lone candidate, or deleting Grimoire (non-frozen) derivations.
 */
import { describe, expect, it } from 'vitest';

import {
  COLLAPSE_MARGIN,
  collapseSuperposition,
  locusKey,
  purifySilicone,
  stemLocus,
  weightSiliconeDerivation,
} from '../../../codex/core/constellation/silicone-superposition.js';
import { FROZEN_EPITOPE_SILICONE } from '../../../codex/core/constellation/epitope-silicone.js';

function node(partial) {
  return { type: 'V', from: 0, to: 2, derivations: [], ...partial };
}

function child(type, from, to) {
  return { type, from, to, derivations: [] };
}

describe('silicone superposition', () => {
  it('keeps a declared collapse margin so we cannot tune after seeing results', () => {
    expect(COLLAPSE_MARGIN).toBe(1.5);
  });

  it('loci are the preserved stem plus signature, so rival adjuncts can compete', () => {
    const host = node({ type: 'N', from: 1, to: 3 });
    expect(locusKey(host)).toBe('1:3:N');
    const stem = child('V', 0, 0);
    const near = { bond: ['V', 'P', 'V', 0], left: stem, right: child('P', 1, 1) };
    const farHost = node({ type: 'V', from: 0, to: 5, derivations: [] });
    const far = { bond: ['V', 'P', 'V', 0], left: stem, right: child('P', 5, 5) };
    expect(stemLocus(farHost, near)).toBe(stemLocus(farHost, far));
    expect(stemLocus(farHost, near)).toBe('0:V|V|P|V');
  });

  it('gives near and far attachments the same amplitude — position is not an observable', () => {
    const host = node({ type: 'V', from: 0, to: 2 });
    const near = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: child('P', 1, 1),
    };
    const far = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: child('P', 4, 4),
    };
    expect(weightSiliconeDerivation(host, near)).toBe(weightSiliconeDerivation(host, far));
  });

  it('collapses only when the leader is ahead by the frozen margin', () => {
    const tied = collapseSuperposition([
      { id: 'a', weight: 2 },
      { id: 'b', weight: 2 },
    ]);
    expect(tied.collapsed).toBe(false);
    expect(tied.kept.map((c) => c.id)).toEqual(['a', 'b']);

    const ahead = collapseSuperposition([
      { id: 'win', weight: 3.1 },
      { id: 'lose', weight: 2 },
    ]);
    expect(ahead.collapsed).toBe(true);
    expect(ahead.kept.map((c) => c.id)).toEqual(['win']);
    expect(ahead.dropped.map((c) => c.id)).toEqual(['lose']);
  });

  it('does not collapse a singleton and does not invent a winner', () => {
    const one = collapseSuperposition([{ id: 'only', weight: 0.4 }]);
    expect(one.collapsed).toBe(false);
    expect(one.kept).toHaveLength(1);
  });

  it('keeps every equally-energetic state — purify does not pick a position', () => {
    const grim = { lift: true, child: child('V', 0, 0) };
    const near = {
      bond: FROZEN_EPITOPE_SILICONE.bonds[0],
      left: child('V', 0, 0),
      right: child('P', 1, 1),
    };
    const far = {
      bond: FROZEN_EPITOPE_SILICONE.bonds[0],
      left: child('V', 0, 0),
      right: child('P', 5, 5),
    };
    const host = node({
      type: 'V',
      from: 0,
      to: 5,
      derivations: [grim, far, near],
    });
    const receipt = purifySilicone({ molecules: [host] });
    expect(receipt.collapsed).toBe(0);
    expect(host.derivations).toEqual([grim, far, near]);
  });

  it('adds realization even when the adjunct already has charge', () => {
    const host = node({ type: 'V', from: 0, to: 2 });
    const charged = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: { ...child('P', 1, 1), charge: 1, derivations: [] },
    };
    const chargedAndReal = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: { ...child('P', 4, 4), charge: 1, derivations: [{}, {}, {}] },
    };
    expect(weightSiliconeDerivation(host, chargedAndReal))
      .toBeGreaterThan(weightSiliconeDerivation(host, charged));
  });

  it('reads held field energy from the leaf slot, not 1/r', () => {
    const host = node({ type: 'V', from: 0, to: 2 });
    const quiet = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: child('P', 1, 1),
    };
    const owned = {
      bond: ['V', 'P', 'V', 0],
      left: child('V', 0, 0),
      right: child('P', 4, 4),
    };
    const field = [
      { index: 0, atoms: [] },
      { index: 1, atoms: [{ type: 'P', charge: 0.2, wonCells: [] }] },
      { index: 2, atoms: [] },
      { index: 3, atoms: [] },
      {
        index: 4,
        atoms: [{ type: 'P', charge: 0.2, wonCells: [{ from: 0 }, { from: 2 }, { from: 3 }] }],
      },
    ];
    expect(weightSiliconeDerivation(host, owned, field))
      .toBeGreaterThan(weightSiliconeDerivation(host, quiet, field));
  });

  it('collapses only when one state energy is ahead, regardless of span', () => {
    const quiet = {
      bond: FROZEN_EPITOPE_SILICONE.bonds[0],
      left: child('V', 0, 0),
      right: { ...child('P', 1, 1), charge: 0.4 },
    };
    const loud = {
      bond: FROZEN_EPITOPE_SILICONE.bonds[0],
      left: child('V', 0, 0),
      right: { ...child('P', 5, 5), charge: 2.0 },
    };
    const host = node({ type: 'V', from: 0, to: 5, derivations: [quiet, loud] });
    const receipt = purifySilicone({ molecules: [host] });
    expect(receipt.collapsed).toBe(1);
    expect(host.derivations).toEqual([loud]);
  });
});
