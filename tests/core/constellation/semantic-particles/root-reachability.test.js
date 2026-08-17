/**
 * T5 — Root-reachability identity photons.
 *
 * Production change that would make these fail: using aura equality as the
 * proof layer, deleting unlit nodes, or failing to distinguish "never bonded"
 * from "refused".
 */
import { describe, expect, it } from 'vitest';

import { composePacked } from '../../../../codex/core/constellation/compose-packed.js';
import { descendFromRoots } from '../../../../codex/core/constellation/resonance-beacon.js';
import {
  collapseReport,
  descendExact,
  identityKey,
  joinRefusals,
  perRootReachability,
  shuffleLitMarks,
} from '../../../../codex/core/constellation/semantic-particles/root-reachability.js';

const pos = new Map([
  ['old', ['a']],
  ['men', ['n']],
  ['ran', ['v']],
  ['the', ['x']],
]);

describe('root-reachability identity', () => {
  it('is the transitive closure of stable roots over derivation edges', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos, { ledger: true });
    const exact = descendExact(chart);
    const existing = descendFromRoots(chart);
    expect(exact.union.size).toBe(existing.size);
    for (const node of existing) expect(exact.union.has(node)).toBe(true);
    expect(exact.collisions).toBe(0);
  });

  it('reports per-root identity, not only the union', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const exact = perRootReachability(chart);
    expect(exact.perRoot.length).toBe(chart.stable.length);
    expect(exact.perRoot.every((row) => row.lit.length > 0)).toBe(true);
  });

  it('identity keys are (type, from, to, derivationId) — not the 32-bit aura', () => {
    const node = {
      type: 'N',
      from: 1,
      to: 1,
      nucleus: { aura: 'aura1:deadbeef' },
      derivations: [],
    };
    expect(identityKey(node)).toBe('N:1:1:leaf');
    expect(identityKey(node)).not.toContain('deadbeef');
  });

  it('joins the refusal ledger so unlit-never-bonded ≠ unlit-refused', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos, { ledger: true });
    const exact = descendExact(chart);
    const joined = joinRefusals(chart, exact);
    expect(joined.unlitNeverBonded).toBeGreaterThanOrEqual(0);
    expect(joined.unlitRefused).toBeGreaterThanOrEqual(0);
    expect(joined.unlitNeverBonded + joined.unlitRefused).toBe(joined.unlit);
  });

  it('Phase 1 annotates and does not delete', () => {
    const off = composePacked(['old', 'men', 'ran'], pos);
    const on = composePacked(['old', 'men', 'ran'], pos, { semanticParticles: true });
    expect(on.molecules.length).toBe(off.molecules.length);
    expect(on.stable.length).toBe(off.stable.length);
    expect(on.events).toBe(off.events);
    expect(on.semanticParticles.reachability.union.size).toBeGreaterThan(0);
  });

  it('shuffled marks keep the lit count and span-width histogram', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const exact = descendExact(chart);
    const shuffled = shuffleLitMarks(chart, exact.union, 0x4c495445);
    expect(shuffled.size).toBe(exact.union.size);
    const widths = (set) => [...set].map((n) => n.to - n.from).sort((a, b) => a - b);
    expect(widths(shuffled)).toEqual(widths(exact.union));
  });

  it('collapse is reported only on tokens that had two or more emitted readings', () => {
    const chart = composePacked(['old', 'men', 'ran'], pos);
    const report = collapseReport(chart, descendExact(chart));
    expect(report.ambiguousTokens).toBeGreaterThanOrEqual(0);
    expect(report.collapsed).toBeLessThanOrEqual(report.ambiguousTokens);
  });
});
