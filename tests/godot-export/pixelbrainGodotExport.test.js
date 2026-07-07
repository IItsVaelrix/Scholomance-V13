import { describe, expect, it } from 'vitest';
import fixture from '../fixtures/godot-export/pixelbrain-basic.pbrain?raw';
import { buildPixelBrainGodotExport } from '../../src/lib/godot-export/pixelbrainGodotExport.js';

describe('buildPixelBrainGodotExport', () => {
  const input = {
    canvas: { width: 2, height: 2, gridSize: 1 },
    palettes: [{ hex: '#FFFFFF', percentage: 100 }],
    coordinates: [{ x: 1, y: 1, color: '#FFFFFF' }],
    formula: null,
  };

  it('serializes deterministically', () => {
    expect(buildPixelBrainGodotExport(input)).toBe(buildPixelBrainGodotExport(input));
  });

  it('matches the phase 0 fixture', () => {
    expect(buildPixelBrainGodotExport(input)).toBe(fixture);
  });

  it('emits parseable JSON', () => {
    const parsed = JSON.parse(buildPixelBrainGodotExport(input));

    expect(parsed.kind).toBe('scholomance.pixelbrain.godot.v1');
    expect(parsed.version).toBe(1);
  });
});
