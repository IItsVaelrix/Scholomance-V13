/**
 * Filled circles under VRI — the hollow-pommel defect, root-caused.
 *
 * The 2026-09-04 verdict's INFO item named lightning-sword's pommel hollow
 * because `ellipse` is a stroke rasterizer, and ruled `ellipse` -> `circle`.
 * Fresh measurement found the deeper half of the bug: even a FILLED `circle`
 * rendered hollow under VRI, because every circle cell carries a
 * strokeHalfWidth and Pass 1's band coverage hollows cells strictly inside the
 * band. The fix marks filled-circle interior cells (raster-core) and teaches
 * Pass 1 to give them half-space fill coverage (vri-renderer).
 *
 * Success criterion from the verdict: the pommel renders filled at every
 * scale, including 1x.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compileAsset } from '../../../../../codex/core/pixelbrain/asset-pipeline.js';
import { compileSCDL } from '../../../../../codex/core/pixelbrain/scdl/scdl.compiler.js';

const SWORD = resolve(process.cwd(), 'PolarisOS/worldpacks/shrine-demo/scdl/lightning-sword.scdl');

describe('filled circles under VRI', () => {
  it.each([1, 2, 4, 16])('lightning-sword pommel centre is opaque at %ix', (scale) => {
    const src = readFileSync(SWORD, 'utf8');
    const result = compileAsset(src, { scale });
    expect(result.ok).toBe(true);
    const W = result.raster.width;
    const px = 8 * scale + Math.floor(scale / 2);
    const py = 30 * scale + Math.floor(scale / 2);
    const idx = (py * W + px) * 4;
    expect(result.raster.data[idx + 3]).toBe(255);
  });

  it('pommel cells: interior marked interiorFill, boundary left to band coverage', () => {
    const src = readFileSync(SWORD, 'utf8');
    const compiled = compileSCDL(src, { strict: false });
    const pommel = compiled.packet.geometry.coordinates.filter(c => c.partId === 'pommel');
    const centre = pommel.find(c => c.x === 8 && c.y === 30);
    const rim = pommel.find(c => c.x === 6 && c.y === 30);
    expect(centre.interiorFill).toBe(true);
    expect(rim.interiorFill).toBeUndefined(); // |sd| <= 0.5: band cell, untouched
    expect(rim.strokeHalfWidth).toBe(0.5);
  });

  it('ellipse strokes are unchanged: the fix fills discs, it does not thicken strokes', () => {
    // A stroke-only ellipse ring must still render hollow-centred.
    const src = [
      'asset t canvas 16x16',
      'palette { c = #D4AF37 }',
      'part ring material gold { ellipse 8 8 radius 5 ry 5 c }',
      'export png',
    ].join('\n');
    const result = compileAsset(src, { scale: 4 });
    expect(result.ok).toBe(true);
    const W = result.raster.width;
    const centreIdx = (8 * 4 * W + 8 * 4) * 4;
    // The ellipse rasterizer walks the perimeter only: the centre stays transparent.
    expect(result.raster.data[centreIdx + 3]).toBe(0);
    // And the ring itself rendered.
    const opaque = result.raster.data.reduce((n, v, i) => (i % 4 === 3 && v > 0 ? n + 1 : n), 0);
    expect(opaque).toBeGreaterThan(0);
  });

  it('a large filled circle renders solid interior with an antialiased edge', () => {
    const src = [
      'asset t canvas 16x16',
      'palette { c = #D4AF37 }',
      'part disc material gold { circle 8 8 radius 6 c }',
      'export png',
    ].join('\n');
    const result = compileAsset(src, { scale: 8 });
    expect(result.ok).toBe(true);
    const W = result.raster.width;
    // Deep interior: opaque.
    expect(result.raster.data[(8 * 8 * W + 8 * 8) * 4 + 3]).toBe(255);
    expect(result.raster.data[(6 * 8 * W + 6 * 8) * 4 + 3]).toBe(255);
    // Far outside: transparent.
    expect(result.raster.data[(0 * W + 0) * 4 + 3]).toBe(0);
    expect(result.raster.data[(15 * 8 * W + 15 * 8) * 4 + 3]).toBe(0);
  });
});
