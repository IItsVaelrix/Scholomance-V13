import { describe, it, expect } from 'vitest';
import { opToSDFPrimitive } from '../../../../../../codex/core/pixelbrain/scdl/render/raster-core.js';
import { normalizeSDFPrimitive } from '../../../../../../codex/core/pixelbrain/pixelbrain-asset-packet.js';

describe('opToSDFPrimitive', () => {
  it('maps a true circle (rx === ry) to an evaluateSDF circle primitive', () => {
    const result = opToSDFPrimitive({ op: 'circle', cx: 15.5, cy: 10, rx: 7.5, ry: 7.5 });
    expect(result).toEqual({ type: 'circle', params: { center: { x: 15.5, y: 10 }, radius: 7.5 } });
  });

  it('maps a circle authored with a single radius field the same way', () => {
    const result = opToSDFPrimitive({ op: 'circle', cx: 4, cy: 4, radius: 2 });
    expect(result).toEqual({ type: 'circle', params: { center: { x: 4, y: 4 }, radius: 2 } });
  });

  it('returns null for an eccentric ellipse (rx !== ry) — no lossless mapping exists', () => {
    const result = opToSDFPrimitive({ op: 'ellipse', cx: 5, cy: 5, rx: 3, ry: 6 });
    expect(result).toBeNull();
  });

  it('maps a rect to an evaluateSDF box primitive using the same half-extent convention', () => {
    const result = opToSDFPrimitive({ op: 'rect', x: 2, y: 2, w: 4, h: 4 });
    expect(result).toEqual({ type: 'box', params: { center: { x: 4, y: 4 }, size: { x: 4, y: 4 } } });
  });

  it.each(['ring', 'polygon', 'sphere', 'path', 'line'])('returns null for deferred op type %s', (op) => {
    expect(opToSDFPrimitive({ op, cx: 0, cy: 0, radius: 1, points: [[0,0]] })).toBeNull();
  });

  it('round-trips through the real normalizeSDFPrimitive without data loss', () => {
    const circle = opToSDFPrimitive({ op: 'circle', cx: 1, cy: 2, radius: 3 });
    const normalized = normalizeSDFPrimitive(circle);
    expect(normalized.type).toBe('circle');
    expect(normalized.params.center).toEqual({ x: 1, y: 2 });
    expect(normalized.params.radius).toBe(3);
  });
});
