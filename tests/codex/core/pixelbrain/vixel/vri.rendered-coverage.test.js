/**
 * Rendered palette coverage — the diagnostic the 2026-09-03 verdict WARNed was
 * measuring the wrong surface.
 *
 * provenance.paletteCoverage reads AUTHORED coordinate colours — but lighting,
 * atmosphere, and quantization rewrite those pixels before they reach the
 * raster, so it cannot say what the image actually contains (lightning-sword
 * read "flat, 6 colours" while rendering many more). The fix is not to move
 * the authored measurement — the value-sketch question it answers is real —
 * but to add the missing rendered-surface measurement, tag both with the
 * surface they describe, and let the pipeline surface both.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-compiler.js';
import { renderVRI } from '../../../../../codex/core/pixelbrain/vixel/vri-renderer.js';
import { compileAsset } from '../../../../../codex/core/pixelbrain/asset-pipeline.js';

function distinctOpaqueColors(raster) {
  const set = new Set();
  for (let i = 0; i < raster.data.length; i += 4) {
    if (raster.data[i + 3] === 0) continue;
    set.add((raster.data[i] << 16) | (raster.data[i + 1] << 8) | raster.data[i + 2]);
  }
  return set;
}

describe('rendered palette coverage', () => {
  it('renderVRI returns a frozen provenance carrying rendered-surface entries', () => {
    const packet = {
      id: 'cov', canvas: { width: 4, height: 4 },
      geometry: { mode: 'coordinates', coordinates: [
        { x: 0, y: 0, color: '#140D02', partId: 'p', material: 'gold' },
        { x: 1, y: 0, color: '#FFFBE6', partId: 'p', material: 'gold' },
      ] },
    };
    const raster = renderVRI(compileVRI(packet, {}), 2);
    expect(Object.isFrozen(raster.provenance)).toBe(true);
    const cov = raster.provenance.renderedPaletteCoverage;
    expect(Array.isArray(cov)).toBe(true);
    expect(cov.length).toBe(1);
    expect(cov[0].surface).toBe('rendered');
    expect(cov[0].material).toBe('gold');
    expect(cov[0].pixels).toBe(8); // 2 cells x 2x2 scale
    expect(cov[0].distinctColors).toBeGreaterThanOrEqual(1);
  });

  it('tags compile-time coverage entries as authored so the two surfaces cannot be conflated', () => {
    const packet = {
      id: 'cov', canvas: { width: 4, height: 4 },
      geometry: { mode: 'coordinates', coordinates: [
        { x: 0, y: 0, color: '#140D02', partId: 'p', material: 'gold' },
      ] },
    };
    const scene = compileVRI(packet, {});
    expect(scene.provenance.paletteCoverage[0].surface).toBe('authored');
  });

  // The 2026-09-03 verdict's success criterion, applied to the very asset it
  // named: lightning-sword's reported coverage must describe its ACTUAL
  // rendered colour count, not the 6 flat colours it was authored with.
  it('lightning-sword: rendered coverage matches the actual rendered colour count at 4x', () => {
    const src = readFileSync(resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/scdl/lightning-sword.scdl'), 'utf8');
    const result = compileAsset(src, { scale: 4 });
    expect(result.ok).toBe(true);

    const cov = result.diagnostics.vri.renderedPaletteCoverage;
    expect(Array.isArray(cov)).toBe(true);
    expect(cov.length).toBeGreaterThan(0);
    expect(cov.every(e => e.surface === 'rendered')).toBe(true);

    const rasterDistinct = distinctOpaqueColors(result.raster);
    const authoredDistinct = new Set(
      result.packet.geometry.coordinates.map(c => c.color.toUpperCase()),
    ).size;

    // Attribution completeness: every opaque pixel belongs to some geometry
    // cell block, so the per-material pixel counts sum to the opaque total.
    const opaquePixels = result.raster.data.reduce((n, _, i) => (i % 4 === 3 && result.raster.data[i] > 0 ? n + 1 : n), 0);
    expect(cov.reduce((n, e) => n + e.pixels, 0)).toBe(opaquePixels);

    // Union bound: the raster's distinct colours cannot exceed the sum of
    // per-material distinct counts.
    expect(cov.reduce((n, e) => n + e.distinctColors, 0)).toBeGreaterThanOrEqual(rasterDistinct.size);

    // The original misdiagnosis, now measured correctly: lighting rewrites the
    // surface, so the rendered colour count exceeds the 6 authored colours.
    expect(rasterDistinct.size).toBeGreaterThan(authoredDistinct);
    expect(rasterDistinct.size).toBeGreaterThan(6);
  });

  it('quantization collapses rendered colours onto ramp anchors', () => {
    const src = readFileSync(resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/scdl/lightning-sword.scdl'), 'utf8');
    const continuous = compileAsset(src, { scale: 4 });
    const quantized = compileAsset(src, { scale: 4, vri: { quantize: true } });
    expect(continuous.ok).toBe(true);
    expect(quantized.ok).toBe(true);
    const coloursContinuous = distinctOpaqueColors(continuous.raster).size;
    const coloursQuantized = distinctOpaqueColors(quantized.raster).size;
    expect(coloursQuantized).toBeLessThan(coloursContinuous);

    const covQuantized = quantized.diagnostics.vri.renderedPaletteCoverage;
    expect(covQuantized.every(e => e.distinctColors >= 1)).toBe(true);
  });

  it('excludes stroke ink: coverage is identical with and without the contour overlay', () => {
    const src = readFileSync(resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/scdl/lightning-sword.scdl'), 'utf8');
    const plain = compileAsset(src, { scale: 4 });
    const inked = compileAsset(src, { scale: 4, render: { strokes: true } });
    expect(plain.ok).toBe(true);
    expect(inked.ok).toBe(true);
    expect(inked.diagnostics.vri.renderedPaletteCoverage)
      .toEqual(plain.diagnostics.vri.renderedPaletteCoverage);
    // The rasters themselves DO differ — ink is painted after measurement.
    expect(Array.from(inked.raster.data)).not.toEqual(Array.from(plain.raster.data));
  });

  it('compileAsset surfaces null rendered coverage when no raster was requested', () => {
    const result = compileAsset('asset t canvas 4x4\npalette { c = #140D02 }\npart p material gold { rect 0 0 2 2 c }\nexport png', {});
    expect(result.ok).toBe(true);
    expect(result.diagnostics.vri.renderedPaletteCoverage).toBeNull();
    expect(result.diagnostics.vri.paletteCoverage[0].surface).toBe('authored');
  });
});
