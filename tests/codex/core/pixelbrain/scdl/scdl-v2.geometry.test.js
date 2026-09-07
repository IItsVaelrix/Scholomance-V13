import { describe, expect, it } from 'vitest';
import {
  createLine,
  createPolyline,
  createRay,
  createRect,
  createRoundedRect,
  createRing,
  createEllipse,
  createArc,
  createSector,
  createTriangle,
  createRegularPolygon,
  createPolygon,
  createStar,
  createPath,
  computeBounds,
  parseSVGPath,
} from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.geometry.js';
import { makeRational } from '../../../../../codex/core/pixelbrain/scdl/v2/scdl-v2.rational.js';

describe('SCDL v2 geometry primitives and bounds', () => {
  const r0 = makeRational(0);
  const r2 = makeRational(2);
  const r4 = makeRational(4);
  const r8 = makeRational(8);
  const r10 = makeRational(10);
  const r16 = makeRational(16);
  const r20 = makeRational(20);

  it('creates a line and computes exact rational bounds', () => {
    const line = createLine({
      from: { x: r0, y: r2 },
      to: { x: r10, y: r8 },
    });
    expect(line.kind).toBe('LINE');
    const bounds = computeBounds(line);
    expect(bounds.x.numerator).toBe('0');
    expect(bounds.y.numerator).toBe('2');
    expect(bounds.width.numerator).toBe('10');
    expect(bounds.height.numerator).toBe('6');

    const polyline = createPolyline({ points: [{ x: r0, y: r0 }, { x: r4, y: r8 }] });
    expect(computeBounds(polyline).height).toEqual(r8);

    const ray = createRay({ origin: { x: r0, y: r0 }, dir: { x: r4, y: r0 }, length: r10 });
    expect(computeBounds(ray).width).toEqual(r10);
  });

  it('creates rect and rounded rect with exact bounds', () => {
    const rect = createRect({
      origin: { x: r2, y: r4 },
      size: { x: r16, y: r8 },
    });
    expect(rect.kind).toBe('RECT');
    const b1 = computeBounds(rect);
    expect(b1.x.numerator).toBe('2');
    expect(b1.y.numerator).toBe('4');
    expect(b1.width.numerator).toBe('16');
    expect(b1.height.numerator).toBe('8');

    const rounded = createRoundedRect({
      origin: { x: r0, y: r0 },
      size: { x: r20, y: r10 },
      cornerRadius: r2,
    });
    expect(rounded.kind).toBe('ROUNDED_RECT');
    expect(rounded.cornerRadius.numerator).toBe('2');
  });

  it('creates ring, ellipse, arc, and sector', () => {
    const ring = createRing({
      center: { x: r10, y: r10 },
      radius: r8,
      thickness: r2,
    });
    expect(ring.kind).toBe('RING');
    const bRing = computeBounds(ring);
    // Center 10, centerline radius 8, thickness 2 -> outer radius is 8 + 2/2 = 9 -> [1, 19]
    expect(bRing.x.numerator).toBe('1');
    expect(bRing.y.numerator).toBe('1');
    expect(bRing.width.numerator).toBe('18');

    const ellipse = createEllipse({
      center: { x: r10, y: r16 },
      radiusX: r4,
      radiusY: r8,
    });
    expect(ellipse.kind).toBe('ELLIPSE');
    const bEllipse = computeBounds(ellipse);
    expect(bEllipse.x.numerator).toBe('6');
    expect(bEllipse.y.numerator).toBe('8');
    expect(bEllipse.width.numerator).toBe('8');
    expect(bEllipse.height.numerator).toBe('16');

    const arc = createArc({
      center: { x: r10, y: r10 },
      radius: r4,
      startAngle: 0,
      endAngle: 90,
      width: r2,
    });
    const bArc = computeBounds(arc);
    expect(bArc.x).toEqual(r10);
    expect(bArc.y).toEqual(r10);
    expect(bArc.width.numerator).toBe('5');
    expect(bArc.height.numerator).toBe('5');

    const sector = createSector({
      center: { x: r10, y: r10 },
      radius: r4,
      startAngle: 0,
      endAngle: 90,
    });
    expect(computeBounds(sector).width).toEqual(r4);
  });

  it('creates triangle, regular polygon, arbitrary polygon, and star', () => {
    const tri = createTriangle({
      p1: { x: r0, y: r0 },
      p2: { x: r10, y: r0 },
      p3: { x: r4, y: r8 },
    });
    expect(tri.kind).toBe('TRIANGLE');
    const bTri = computeBounds(tri);
    expect(bTri.x.numerator).toBe('0');
    expect(bTri.width.numerator).toBe('10');
    expect(bTri.height.numerator).toBe('8');

    const star = createStar({
      points: 5,
      innerRadius: r4,
      outerRadius: r8,
      center: { x: r10, y: r10 },
    });
    expect(star.kind).toBe('STAR');
    expect(star.points).toBe(5);

    const poly = createPolygon({
      vertices: [
        { x: r0, y: r0 },
        { x: r8, y: r0 },
        { x: r8, y: r8 },
        { x: r0, y: r8 },
      ],
    });
    expect(poly.kind).toBe('POLYGON');
    expect(poly.vertices.length).toBe(4);
  });

  it('pre-normalizes concatenated SVG arc flags to prevent fused tokens (Pattern #6)', () => {
    // "A 5 5 0 01 10 10" has concatenated flags "01"
    const parsed = parseSVGPath('M 0 0 A 5 5 0 01 10 10 Z');
    expect(parsed.length).toBe(3);
    expect(parsed[0]).toEqual({ type: 'M', x: 0, y: 0 });
    expect(parsed[1]).toMatchObject({
      type: 'A',
      rx: 5,
      ry: 5,
      xAxisRotation: 0,
      largeArcFlag: 0,
      sweepFlag: 1,
      x: 10,
      y: 10,
    });
    expect(parsed[2]).toEqual({ type: 'Z' });

    const path = createPath({ d: 'M 1 1 H 4 V 4' });
    const bounds = computeBounds(path);
    expect(bounds.x).toEqual(makeRational(1));
    expect(bounds.y).toEqual(makeRational(1));
    expect(bounds.width).toEqual(makeRational(3));
    expect(bounds.height).toEqual(makeRational(3));
  });

  it('rejects degenerate primitive parameters with structured errors', () => {
    expect(() => createRing({
      center: { x: r0, y: r0 },
      radius: makeRational(-5),
      thickness: r2,
    })).toThrow(/radius must be positive/i);

    expect(() => createRegularPolygon({
      sides: 2,
      radius: r4,
      center: { x: r0, y: r0 },
    })).toThrow(/sides must be at least 3/i);

    expect(() => createStar({
      points: 2,
      innerRadius: r2,
      outerRadius: r4,
      center: { x: r0, y: r0 },
    })).toThrow(/star points must be at least 3/i);
  });
});
