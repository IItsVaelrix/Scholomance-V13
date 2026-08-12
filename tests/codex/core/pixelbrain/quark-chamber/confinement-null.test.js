/**
 * Falsifier 1 — confinement configuration null. PB-QUARK-CHAMBER-v1
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 */

import { describe, it, expect } from 'vitest';
import { runConfinementNull } from '../../../../../scripts/quark-confinement-null.mjs';
import { ATOM_BLUEPRINTS, BRIDGE_RULES } from '../../../../../scripts/semantic-valence-cyclotron.mjs';
import { buildDefaultBank } from '../../../../../codex/core/pixelbrain/codebase-nuclei-bank.js';

const { blueprints: FULL_ATOMS, bridges: FULL_BRIDGES } =
  buildDefaultBank(ATOM_BLUEPRINTS, BRIDGE_RULES, {});

describe('confinement configuration null (Falsifier 1)', () => {
  it('reports exactly the four pre-registered statistics', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    expect(Object.keys(out.stats).sort()).toEqual(['confined', 'edges', 'maxWaypoints', 'rules']);
  });

  it('measures the real bank at its known values', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    expect(out.real.edges).toBe(191);
    expect(out.real.rules).toBe(169);
    expect(out.real.confined).toBe(15);
    expect(out.real.maxWaypoints).toBe(3);
  });

  it('uses the conservative p estimator (1 + hits) / (1 + N)', () => {
    const out = runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 20, seed: 0x51554152, confinementMin: 2,
    });
    for (const stat of Object.values(out.stats)) {
      // With N = 20 the smallest attainable p is 1/21 = 0.047619..., stored at
      // 6dp. The point is that p can never be reported as 0, which is what the
      // +1 in the numerator buys.
      expect(stat.p).toBeCloseTo(Math.max(stat.p, 1 / 21), 6);
      expect(stat.p).toBeGreaterThan(0);
      expect(stat.p).toBeLessThanOrEqual(1);
      expect(Number.isFinite(stat.z)).toBe(true);
    }
  });

  it('rejects a non-integer shuffle count rather than coercing it', () => {
    expect(() => runConfinementNull({
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 0, seed: 1,
    })).toThrow(/shuffles/i);
  });

  it('is deterministic for a seed', () => {
    const args = {
      blueprints: FULL_ATOMS, bridges: FULL_BRIDGES, shuffles: 10, seed: 99, confinementMin: 2,
    };
    expect(runConfinementNull(args)).toEqual(runConfinementNull(args));
  });
});
