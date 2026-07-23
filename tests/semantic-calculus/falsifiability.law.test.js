/**
 * THE FALSIFIABILITY LAW.
 *
 * A hypothesis without a falsifier reports SUPPORTED forever: evaluateHypotheses
 * never sets `elim` or `undetermined`, so the moment its predictions hold it wins
 * on every corpus, permanently. The type system permitted it — `falsifiers` is
 * just an array, and an empty one is well-typed.
 *
 * That is the shape of every defect this repo produced in a day:
 * `decision.kind !== decision.kind`; an identity check on an object rebuilt every
 * call; a prediction with no predicate; Phaser's setMask warning and returning.
 * Checks that cannot fail. This law makes the next one unrepresentable in the very
 * module whose job is killing claims.
 */
import { describe, it, expect } from 'vitest';
import { PROBE_FORMULAS, assertFalsifiable } from '../../codex/core/semantic-calculus/probeRegistry.ts';
import { evaluateHypotheses } from '../../codex/core/semantic-calculus/hypothesisStatus.js';
import { makeReceipt } from '../../codex/core/semantic-calculus/observationReceipt.ts';
import { SEMANTIC_CALCULUS_ERRORS } from '../../codex/core/semantic-calculus/types.ts';

const probeWith = (hypotheses) => ({
  id: 'test.probe',
  version: '1.0.0',
  patterns: [],
  keywords: [],
  observations: [{ id: 'obs.x', description: 'x', harness: 'h', required: true }],
  hypotheses,
  maxRisk: 'read_only',
  citeSeeds: [],
});

describe('the law bites', () => {
  it('rejects a hypothesis with NO falsifier', () => {
    const bad = probeWith([
      { id: 'h_unkillable', claim: 'always true', predictions: [], falsifiers: [], citeSeeds: [] },
    ]);
    expect(() => assertFalsifiable(bad)).toThrow(SEMANTIC_CALCULUS_ERRORS.UNFALSIFIABLE_HYPOTHESIS);
    expect(() => assertFalsifiable(bad)).toThrow(/h_unkillable/);
  });

  it('rejects a falsifier aimed at evidence the probe never collects', () => {
    // A falsifier pointed at an observation nobody gathers cannot fire — it looks
    // like rigour and is decoration. This is the exact mistake I made live:
    // asking for `phaserCanvasCount` from a harness that returned `canvasCount`.
    const bad = probeWith([
      {
        id: 'h_aimed_at_nothing',
        claim: 'x',
        predictions: [],
        falsifiers: [{ id: 'f_ghost', description: 'never fires', observationId: 'obs.nobody.collects', predicate: { op: 'truthy', path: 'a' } }],
        citeSeeds: [],
      },
    ]);
    expect(() => assertFalsifiable(bad)).toThrow(/obs\.nobody\.collects/);
  });

  it('accepts a hypothesis that can actually lose', () => {
    const good = probeWith([
      {
        id: 'h_killable',
        claim: 'x',
        predictions: [],
        falsifiers: [{ id: 'f', description: 'kills it', observationId: 'obs.x', predicate: { op: 'truthy', path: 'a' } }],
        citeSeeds: [],
      },
    ]);
    expect(() => assertFalsifiable(good)).not.toThrow();
  });
});

describe('WHY the law exists — an unfalsifiable claim always wins', () => {
  it('a falsifier-less hypothesis reports supported on evidence that refutes its rivals', () => {
    const unkillable = { id: 'h_unkillable', claim: 'vibes', predictions: [], falsifiers: [], citeSeeds: [] };
    const killable = {
      id: 'h_honest',
      claim: 'testable',
      predictions: [],
      falsifiers: [{ id: 'f', description: 'kills it', observationId: 'obs.x', predicate: { op: 'truthy', path: 'dead' } }],
      citeSeeds: [],
    };
    const receipts = [makeReceipt({ probeId: 'test.probe', observationId: 'obs.x', result: { dead: true }, status: 'observed' })];

    const e = evaluateHypotheses([unkillable, killable], receipts);
    // The honest claim dies on the evidence. The unfalsifiable one sails through
    // the identical evidence — because there was never a way for it to lose.
    expect(e.eliminated).toContain('h_honest');
    expect(e.supported).toContain('h_unkillable');
  });
});

describe('every shipped formula obeys its own law', () => {
  for (const probe of PROBE_FORMULAS) {
    it(`${probe.id} is falsifiable`, () => {
      expect(() => assertFalsifiable(probe)).not.toThrow();
      for (const h of probe.hypotheses) expect(h.falsifiers.length).toBeGreaterThan(0);
    });
  }
});
