/**
 * Falsifier 2 — authored-bridge recovery. PB-QUARK-CHAMBER-v1
 *
 * Prereg: docs/superpowers/evidence/2026-08-12-PREREG-quark-chamber.md
 */

import { describe, it, expect } from 'vitest';
import { runAuthoredRecovery } from '../../../../../scripts/quark-authored-recovery.mjs';

const ATOM = (id, offers, seeks) => ({
  id,
  label: `${id} test atom`,
  domain: 'synthesis',
  offers,
  seeks,
  traits: [],
  inhibits: [],
  evidence: ['codex/core/pixelbrain/canonical-json.js'],
  grounding: 0.8,
});

describe('authored-bridge recovery (Falsifier 2)', () => {
  it('recovers a bridge the exact-match graph can reach by two waypoints', () => {
    // With the bridge held out, p-a -> p-w must still be reachable via way-1 and way-2.
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('way-1', ['p-w'], ['p-a']),
      ATOM('way-2', ['p-w'], ['p-a']),
      ATOM('atom-b', ['p-b'], ['p-w']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
    const result = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(result.heldOut).toBe(1);
    expect(result.recovered).toBe(1);
    expect(result.recall).toBe(1);
    expect(result.recoveredPairs).toEqual(['p-a|p-w']);
  });

  it('reports zero recovery honestly when the graph cannot reach the pair', () => {
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('atom-b', ['p-b'], ['p-z']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-b', relation: 'carries', strength: 0.9 }];
    const result = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(result.heldOut).toBe(1);
    expect(result.recovered).toBe(0);
    expect(result.recall).toBe(0);
  });

  it('is deterministic', () => {
    const bank = [
      ATOM('atom-a', ['p-a'], []),
      ATOM('way-1', ['p-w'], ['p-a']),
      ATOM('way-2', ['p-w'], ['p-a']),
      ATOM('atom-b', ['p-b'], ['p-w']),
    ];
    const bridges = [{ from: 'p-a', to: 'p-w', relation: 'carries', strength: 0.9 }];
    const a = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    const b = runAuthoredRecovery({ blueprints: bank, bridges, confinementMin: 2 });
    expect(a).toEqual(b);
  });
});
