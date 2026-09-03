import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';
import { compileVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-compiler.js';
import { renderVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-renderer.js';
import { extractContours } from '../../../../../codex/core/pixelbrain/vixel/stroke-extractor.js';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../../../..');
const source = readFileSync(
  resolve(repoRoot, 'codex/core/pixelbrain/scdl/fixtures/void_acolyte/void_acolyte.scdl'),
  'utf8',
);

function sceneFor(src) {
  const compiled = compileSCDL(src, {});
  return compileVRI(compiled.packet, {});
}

describe('renderVRI stroke overlay', () => {
  it('options.strokes omitted or false produces byte-identical output to the two-argument call', () => {
    const scene = sceneFor(source);
    const withoutOptions = renderVRI(scene, 8);
    const explicitFalse = renderVRI(scene, 8, { strokes: false });
    expect(Buffer.from(explicitFalse.data).equals(Buffer.from(withoutOptions.data))).toBe(true);
  });

  it('options.strokes: true changes the raster (it is not a silent no-op)', () => {
    const scene = sceneFor(source);
    const without = renderVRI(scene, 8);
    const withStrokes = renderVRI(scene, 8, { strokes: true });
    expect(Buffer.from(withStrokes.data).equals(Buffer.from(without.data))).toBe(false);
  });

  it('every real extracted silhouette cell for this asset is opaque in the render — the tearing bug is fixed', () => {
    const scene = sceneFor(source);
    const { width, data } = renderVRI(scene, 1, { strokes: true }); // scale 1: one pixel per cell, easy to inspect
    const geoLayer = scene.layers.find((l) => l.type === 'geometry');
    const strokes = extractContours(geoLayer.payload.coordinates);
    const silhouetteCells = strokes.filter((s) => s.role === 'silhouette').flatMap((s) => s.path.cells);
    expect(silhouetteCells.length).toBeGreaterThan(0); // the hood's circle op must produce real silhouette cells
    for (const { x, y } of silhouetteCells) {
      const idx = (y * width + x) * 4;
      expect(data[idx + 3]).toBe(255); // opaque, not the transparent gap the original bug produced
    }
  });
});
