import { describe, expect, it } from 'vitest';
import {
  getAnchor,
  defineAnchor,
  alignShapes,
  isInside,
  contains,
  touches,
  assertGeometricCondition,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.anchors.js';
import { createRect } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 named anchors, alignment solver, and constraints', () => {
  const r0 = makeRational(0);
  const r10 = makeRational(10);
  const r20 = makeRational(20);

  it('computes standard bounding box anchors on primitives', () => {
    const rect = createRect({
      origin: { x: r10, y: r10 },
      size: { x: r20, y: r20 },
    });
    // Center: (10 + 10, 10 + 10) = (20, 20)
    const center = getAnchor(rect, 'CENTER');
    expect(center.x.numerator).toBe('20');
    expect(center.y.numerator).toBe('20');

    // Top: (20, 10)
    const top = getAnchor(rect, 'TOP');
    expect(top.x.numerator).toBe('20');
    expect(top.y.numerator).toBe('10');

    // Bottom Right: (30, 30)
    const br = getAnchor(rect, 'BOTTOM_RIGHT');
    expect(br.x.numerator).toBe('30');
    expect(br.y.numerator).toBe('30');
  });

  it('defines custom named anchors on shapes', () => {
    const rect = createRect({
      origin: { x: r0, y: r0 },
      size: { x: r20, y: r20 },
    });
    const withAnchor = defineAnchor(rect, 'tip', { x: makeRational(10), y: makeRational(5) });
    const tip = getAnchor(withAnchor, 'tip');
    expect(tip.x.numerator).toBe('10');
    expect(tip.y.numerator).toBe('5');
  });

  it('aligns target shape to reference shape using anchors and offset', () => {
    const base = createRect({
      origin: { x: r0, y: r0 },
      size: { x: r20, y: r20 },
    });
    const gem = createRect({
      origin: { x: r0, y: r0 },
      size: { x: makeRational(4), y: makeRational(4) },
    });

    // Align gem.CENTER to base.TOP with offset (0, -2)
    const aligned = alignShapes({
      targetShape: gem,
      targetAnchor: 'CENTER',
      refShape: base,
      refAnchor: 'TOP',
      offset: { x: r0, y: makeRational(-2) },
    });

    // base.TOP is (10, 0).
    // offset is (0, -2) -> target location is (10, -2).
    // gem.CENTER was at (2, 2).
    // translation required: dx = 10 - 2 = 8, dy = -2 - 2 = -4.
    // gem origin becomes (8, -4).
    expect(aligned.origin.x.numerator).toBe('8');
    expect(aligned.origin.y.numerator).toBe('-4');
  });

  it('evaluates geometric predicates: isInside, contains, touches', () => {
    const canvas = createRect({
      origin: { x: r0, y: r0 },
      size: { x: makeRational(64), y: makeRational(64) },
    });
    const insidePt = { x: makeRational(32), y: makeRational(32) };
    const outsidePt = { x: makeRational(100), y: makeRational(32) };

    expect(isInside(insidePt, canvas)).toBe(true);
    expect(isInside(outsidePt, canvas)).toBe(false);

    const smallRect = createRect({
      origin: { x: r10, y: r10 },
      size: { x: r10, y: r10 },
    });
    expect(contains(canvas, smallRect)).toBe(true);

    const overlappingRect = createRect({
      origin: { x: makeRational(50), y: makeRational(50) },
      size: { x: r20, y: r20 },
    });
    expect(touches(canvas, overlappingRect)).toBe(true);
  });

  it('validates assertions and throws structured diagnostic on failure', () => {
    expect(() => assertGeometricCondition(true)).not.toThrow();
    expect(() => assertGeometricCondition(false, {
      message: 'Point is outside canvas bounds',
      span: { start: { line: 10, column: 1, offset: 100 }, end: { line: 10, column: 20, offset: 120 } },
    })).toThrow(/outside canvas bounds/i);
  });
});
