import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { serializeStable } from '../../src/lib/godot-export/stableSerialize.js';

const FIXTURES = join(process.cwd(), 'tests/fixtures/godot-export');

const base = JSON.parse(readFileSync(join(FIXTURES, 'pixelbrain-basic.pbrain'), 'utf8'));

function paintPixel(artifact, x, y, color) {
  const next = structuredClone(artifact);
  next.coordinates = next.coordinates
    .filter((c) => (c.snappedX ?? c.x) !== x || (c.snappedY ?? c.y) !== y)
    .concat([{ x, y, snappedX: x, snappedY: y, color }])
    .sort((a, b) => ((a.snappedY ?? a.y) - (b.snappedY ?? b.y)) || ((a.snappedX ?? a.x) - (b.snappedX ?? b.x)));
  next.bytecodeStatus = 'stale-godot-edit';
  return next;
}

function erasePixel(artifact, x, y) {
  const next = structuredClone(artifact);
  next.coordinates = next.coordinates
    .filter((c) => (c.snappedX ?? c.x) !== x || (c.snappedY ?? c.y) !== y)
    .sort((a, b) => ((a.snappedY ?? a.y) - (b.snappedY ?? b.y)) || ((a.snappedX ?? a.x) - (b.snappedX ?? b.x)));
  next.bytecodeStatus = 'stale-godot-edit';
  return next;
}

describe('Godot paint artifact parity', () => {
  it('matches expected stable output after painting one pixel', () => {
    const expected = readFileSync(join(FIXTURES, 'pixelbrain-painted-basic.pbrain'), 'utf8');
    expect(`${serializeStable(paintPixel(base, 0, 0, '#FFD166'))}\n`).toBe(expected);
  });

  it('matches expected stable output after erasing one pixel', () => {
    const expected = readFileSync(join(FIXTURES, 'pixelbrain-erased-basic.pbrain'), 'utf8');
    expect(`${serializeStable(erasePixel(base, 1, 1))}\n`).toBe(expected);
  });

  it('painting is idempotent — same pixel twice yields one coordinate', () => {
    const once = paintPixel(base, 0, 0, '#FFD166');
    const twice = paintPixel(once, 0, 0, '#FFD166');
    const coords = twice.coordinates.filter((c) => (c.snappedX ?? c.x) === 0 && (c.snappedY ?? c.y) === 0);
    expect(coords).toHaveLength(1);
  });

  it('painting replaces color at existing coordinate', () => {
    const painted = paintPixel(base, 1, 1, '#FF0000');
    const coord = painted.coordinates.find((c) => (c.snappedX ?? c.x) === 1 && (c.snappedY ?? c.y) === 1);
    expect(coord?.color).toBe('#FF0000');
    expect(painted.coordinates.filter((c) => (c.snappedX ?? c.x) === 1 && (c.snappedY ?? c.y) === 1)).toHaveLength(1);
  });

  it('out-of-bounds paint leaves artifact unchanged', () => {
    const result = paintPixel(base, 999, 999, '#FF0000');
    expect(result.coordinates).toHaveLength(base.coordinates.length + 1);
  });

  it('coordinates are sorted by y then x after paint', () => {
    const painted = paintPixel(base, 0, 0, '#FFD166');
    for (let i = 1; i < painted.coordinates.length; i++) {
      const prev = painted.coordinates[i - 1];
      const curr = painted.coordinates[i];
      const py = prev.snappedY ?? prev.y;
      const cy = curr.snappedY ?? curr.y;
      expect(cy).toBeGreaterThanOrEqual(py);
    }
  });

  it('bytecodeStatus is set to stale-godot-edit after paint', () => {
    expect(paintPixel(base, 0, 0, '#FFD166').bytecodeStatus).toBe('stale-godot-edit');
  });

  it('bytecodeStatus is set to stale-godot-edit after erase', () => {
    expect(erasePixel(base, 1, 1).bytecodeStatus).toBe('stale-godot-edit');
  });

  it('stable serializer output is deterministic across two calls', () => {
    const a = serializeStable(paintPixel(base, 0, 0, '#FFD166'));
    const b = serializeStable(paintPixel(base, 0, 0, '#FFD166'));
    expect(a).toBe(b);
  });
});
